import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "../services/api";
import { useToast } from "./ToastContext";
import { CallContext } from "./callContextDef";
import {
  startIncomingRingtone,
  startOutgoingRingback,
  stopCallTones,
  unlockCallAudio,
} from "../utils/callRingtone";

/**
 * Possible callState values:
 *  "idle" | "outgoing-ringing" | "incoming-ringing" | "connecting" | "active"
 */

const RING_TIMEOUT_MS = 30_000; // Auto-cancel/reject after 30s of unanswered ringing
const DEFAULT_ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export function CallProvider({ wsRef, children }) {
  const { info: toastInfo, error: toastError } = useToast();

  const [callState, setCallState] = useState("idle");
  const [remoteUserId, setRemoteUserId] = useState(null);
  const [remoteUserName, setRemoteUserName] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const callStateRef = useRef("idle");
  const remoteUserIdRef = useRef(null);
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const pendingOfferSdpRef = useRef(null);
  const ringTimerRef = useRef(null);
  const durationTimerRef = useRef(null);
  const iceServersRef = useRef(null);
  const iceCandidateBufferRef = useRef([]);

  const updateCallState = useCallback((nextState) => {
    callStateRef.current = nextState;
    setCallState(nextState);
  }, []);

  const updateRemoteUser = useCallback((uid, name) => {
    remoteUserIdRef.current = uid;
    setRemoteUserId(uid);
    setRemoteUserName(name);
  }, []);

  const clearTimers = useCallback(() => {
    if (ringTimerRef.current) {
      clearTimeout(ringTimerRef.current);
      ringTimerRef.current = null;
    }
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
  }, []);

  const sendViaWs = useCallback(
    (msg) => {
      const ws = wsRef?.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
        return true;
      }
      return false;
    },
    [wsRef],
  );

  const stopLocalMedia = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
  }, []);

  const resetCall = useCallback(() => {
    clearTimers();
    if (peerRef.current) {
      peerRef.current.onicecandidate = null;
      peerRef.current.ontrack = null;
      peerRef.current.onconnectionstatechange = null;
      peerRef.current.close();
      peerRef.current = null;
    }
    stopLocalMedia();
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    iceCandidateBufferRef.current = [];
    pendingOfferSdpRef.current = null;
    updateCallState("idle");
    updateRemoteUser(null, null);
    setIsMuted(false);
    setCallDuration(0);
  }, [clearTimers, stopLocalMedia, updateCallState, updateRemoteUser]);

  const fetchIceServers = useCallback(async () => {
    if (iceServersRef.current) return iceServersRef.current;
    try {
      const res = await api.get("/chat/ice-servers");
      const servers =
        Array.isArray(res.data?.iceServers) && res.data.iceServers.length > 0
          ? res.data.iceServers
          : DEFAULT_ICE_SERVERS;
      iceServersRef.current = servers;
      return servers;
    } catch {
      return DEFAULT_ICE_SERVERS;
    }
  }, []);

  const createPeer = useCallback(
    async (targetUserId) => {
      const iceServers = await fetchIceServers();
      const pc = new RTCPeerConnection({ iceServers });

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          sendViaWs({
            type: "call:ice",
            targetUserId,
            candidate: e.candidate.toJSON(),
          });
        }
      };

      pc.ontrack = (e) => {
        const audioEl = remoteAudioRef.current;
        if (audioEl) {
          audioEl.srcObject = e.streams[0] || new MediaStream([e.track]);
          audioEl.play().catch(() => {
            // Autoplay fallback handled when browser grants interaction
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (
          pc.connectionState === "disconnected" ||
          pc.connectionState === "failed" ||
          pc.connectionState === "closed"
        ) {
          resetCall();
          return;
        }
        if (pc.connectionState === "connected") {
          clearTimers();
          updateCallState("active");
          const start = Date.now();
          durationTimerRef.current = setInterval(() => {
            setCallDuration(Math.floor((Date.now() - start) / 1000));
          }, 1000);
        }
      };

      peerRef.current = pc;
      return pc;
    },
    [fetchIceServers, sendViaWs, resetCall, clearTimers, updateCallState],
  );

  // ── public actions ─────────────────────────────────────────
  const startCall = useCallback(
    async (targetUserId, targetUserName) => {
      if (!targetUserId) return;
      if (callStateRef.current !== "idle") {
        toastInfo("Finish your current call before starting a new one");
        return;
      }
      if (!wsRef?.current || wsRef.current.readyState !== WebSocket.OPEN) {
        toastError("Chat connection is offline. Please wait to reconnect.");
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        toastError("Voice calling requires microphone support over HTTPS.");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = stream;

        updateCallState("outgoing-ringing");
        updateRemoteUser(targetUserId, targetUserName);

        const pc = await createPeer(targetUserId);
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        sendViaWs({
          type: "call:offer",
          targetUserId,
          sdp: pc.localDescription.toJSON(),
        });

        // Auto-cancel after 30s if still ringing
        ringTimerRef.current = setTimeout(() => {
          if (callStateRef.current === "outgoing-ringing") {
            sendViaWs({ type: "call:hangup", targetUserId });
            toastInfo("No answer");
            resetCall();
          }
        }, RING_TIMEOUT_MS);
      } catch (err) {
        console.error("[Call] startCall failed:", err);
        const msg =
          err?.name === "NotAllowedError"
            ? "Microphone permission denied. Allow mic access to place a call."
            : err?.name === "NotFoundError"
              ? "No microphone detected on this device."
              : "Could not start voice call.";
        toastError(msg);
        resetCall();
      }
    },
    [
      wsRef,
      createPeer,
      sendViaWs,
      resetCall,
      updateCallState,
      updateRemoteUser,
      toastInfo,
      toastError,
    ],
  );

  const acceptCall = useCallback(async () => {
    const targetId = remoteUserIdRef.current;
    if (
      callStateRef.current !== "incoming-ringing" ||
      !pendingOfferSdpRef.current ||
      !targetId
    ) {
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      toastError("Microphone access is not supported in this browser.");
      sendViaWs({ type: "call:reject", targetUserId: targetId });
      resetCall();
      return;
    }

    clearTimers();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      updateCallState("connecting");

      const pc = await createPeer(targetId);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      await pc.setRemoteDescription(
        new RTCSessionDescription(pendingOfferSdpRef.current),
      );
      pendingOfferSdpRef.current = null;

      // Drain buffered ICE candidates that arrived before answer creation
      for (const c of iceCandidateBufferRef.current) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(c));
        } catch {
          // skip invalid candidate
        }
      }
      iceCandidateBufferRef.current = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      sendViaWs({
        type: "call:answer",
        targetUserId: targetId,
        sdp: pc.localDescription.toJSON(),
      });
    } catch (err) {
      console.error("[Call] acceptCall failed:", err);
      toastError(
        err?.name === "NotAllowedError"
          ? "Microphone permission denied."
          : "Failed to connect call.",
      );
      sendViaWs({ type: "call:reject", targetUserId: targetId });
      resetCall();
    }
  }, [clearTimers, createPeer, sendViaWs, resetCall, updateCallState, toastError]);

  const rejectCall = useCallback(() => {
    const targetId = remoteUserIdRef.current;
    if (targetId) {
      sendViaWs({ type: "call:reject", targetUserId: targetId });
    }
    resetCall();
  }, [sendViaWs, resetCall]);

  const hangUp = useCallback(() => {
    const targetId = remoteUserIdRef.current;
    if (targetId) {
      sendViaWs({ type: "call:hangup", targetUserId: targetId });
    }
    resetCall();
  }, [sendViaWs, resetCall]);

  const toggleMute = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setIsMuted(!track.enabled);
    }
  }, []);

  // ── incoming WS events handler (registered by CallEventWire) ──
  const handleCallEvent = useCallback(
    async (event) => {
      if (!event?.type) return;

      switch (event.type) {
        case "call:offer": {
          if (callStateRef.current !== "idle") {
            sendViaWs({ type: "call:busy", targetUserId: event.fromUserId });
            return;
          }
          pendingOfferSdpRef.current = event.sdp;
          iceCandidateBufferRef.current = [];
          updateRemoteUser(event.fromUserId, event.fromUserName);
          updateCallState("incoming-ringing");

          ringTimerRef.current = setTimeout(() => {
            if (callStateRef.current === "incoming-ringing") {
              sendViaWs({ type: "call:reject", targetUserId: event.fromUserId });
              resetCall();
            }
          }, RING_TIMEOUT_MS);
          break;
        }

        case "call:answer": {
          if (!peerRef.current || event.fromUserId !== remoteUserIdRef.current) {
            return;
          }
          clearTimers();
          try {
            await peerRef.current.setRemoteDescription(
              new RTCSessionDescription(event.sdp),
            );
            for (const c of iceCandidateBufferRef.current) {
              try {
                await peerRef.current.addIceCandidate(new RTCIceCandidate(c));
              } catch {
                // skip
              }
            }
            iceCandidateBufferRef.current = [];
            updateCallState("connecting");
          } catch (err) {
            console.error("[Call] setRemoteDescription failed:", err);
            resetCall();
          }
          break;
        }

        case "call:ice": {
          if (event.fromUserId !== remoteUserIdRef.current) return;
          if (peerRef.current && peerRef.current.remoteDescription) {
            try {
              await peerRef.current.addIceCandidate(
                new RTCIceCandidate(event.candidate),
              );
            } catch {
              // skip invalid candidate
            }
          } else {
            iceCandidateBufferRef.current.push(event.candidate);
          }
          break;
        }

        case "call:reject": {
          if (event.fromUserId !== remoteUserIdRef.current) return;
          toastInfo(`${remoteUserName || "User"} declined the call`);
          resetCall();
          break;
        }

        case "call:hangup": {
          if (event.fromUserId !== remoteUserIdRef.current) return;
          resetCall();
          break;
        }

        case "call:busy": {
          if (event.fromUserId !== remoteUserIdRef.current) return;
          toastInfo(`${remoteUserName || "User"} is busy on another call`);
          resetCall();
          break;
        }

        case "call:unavailable": {
          if (event.targetUserId !== remoteUserIdRef.current) return;
          toastInfo(`${remoteUserName || "User"} is currently offline`);
          resetCall();
          break;
        }

        default:
          break;
      }
    },
    [
      sendViaWs,
      resetCall,
      clearTimers,
      updateRemoteUser,
      updateCallState,
      toastInfo,
      remoteUserName,
    ],
  );

  const handleCallEventRef = useRef(handleCallEvent);
  useEffect(() => {
    handleCallEventRef.current = handleCallEvent;
  }, [handleCallEvent]);

  // Unlock Web Audio API on first user gesture so incoming calls can ring immediately
  useEffect(() => {
    const handleUnlock = () => unlockCallAudio();
    window.addEventListener("pointerdown", handleUnlock, { once: true, passive: true });
    window.addEventListener("keydown", handleUnlock, { once: true, passive: true });
    return () => {
      window.removeEventListener("pointerdown", handleUnlock);
      window.removeEventListener("keydown", handleUnlock);
    };
  }, []);

  // Play incoming ringtone or outgoing ringback tone based on callState
  useEffect(() => {
    if (callState === "incoming-ringing") {
      startIncomingRingtone();
    } else if (callState === "outgoing-ringing") {
      startOutgoingRingback();
    } else {
      stopCallTones();
    }
    return () => stopCallTones();
  }, [callState]);

  useEffect(() => {
    return () => {
      stopCallTones();
      resetCall();
    };
  }, [resetCall]);

  const value = useMemo(
    () => ({
      callState,
      remoteUserId,
      remoteUserName,
      isMuted,
      callDuration,
      startCall,
      acceptCall,
      rejectCall,
      hangUp,
      toggleMute,
      handleCallEventRef,
    }),
    [
      callState,
      remoteUserId,
      remoteUserName,
      isMuted,
      callDuration,
      startCall,
      acceptCall,
      rejectCall,
      hangUp,
      toggleMute,
    ],
  );

  return (
    <CallContext.Provider value={value}>
      {children}
      {/* Hidden audio element for playing remote WebRTC audio stream */}
      <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: "none" }} />
    </CallContext.Provider>
  );
}
