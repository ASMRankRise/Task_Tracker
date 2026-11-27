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
 * callMode: null | "direct" | "huddle"
 * callState: "idle" | "outgoing-ringing" | "incoming-ringing" | "connecting" | "active"
 * callType: "audio" | "video"
 */

const RING_TIMEOUT_MS = 30_000;
const DIRECT_VIDEO_CONSTRAINTS = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  facingMode: "user",
};
const GROUP_VIDEO_CONSTRAINTS = {
  width: { ideal: 480, max: 640 },
  height: { ideal: 360, max: 480 },
  frameRate: { ideal: 15, max: 20 },
  facingMode: "user",
};
const DEFAULT_ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

async function drainIceCandidates(pc, buffer) {
  while (buffer.length > 0) {
    const candidate = buffer.shift();
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch {
      // Skip invalid candidate
    }
  }
}

function HuddlePeerAudio({ stream }) {
  const audioRef = useRef(null);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (!stream) {
      el.srcObject = null;
      return;
    }
    const audioTracks = stream.getAudioTracks();
    el.srcObject = audioTracks.length > 0 ? new MediaStream(audioTracks) : null;
    if (audioTracks.length > 0) {
      el.play().catch(() => {});
    }
  }, [stream]);

  return <audio ref={audioRef} autoPlay playsInline style={{ display: "none" }} />;
}

export function CallProvider({ wsRef, children }) {
  const { info: toastInfo, error: toastError } = useToast();

  // Shared call state
  const [callMode, setCallMode] = useState(null);
  const [callState, setCallState] = useState("idle");
  const [callType, setCallType] = useState("audio");
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  // Media state (shared between direct & huddle)
  const [localStream, setLocalStream] = useState(null);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  // 1-to-1 direct call state
  const [remoteUserId, setRemoteUserId] = useState(null);
  const [remoteUserName, setRemoteUserName] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [remoteMediaState, setRemoteMediaState] = useState({
    cameraEnabled: false,
    isScreenSharing: false,
  });

  // Group huddle state (up to 5 participants)
  const [huddleConvId, setHuddleConvId] = useState(null);
  const [huddleTitle, setHuddleTitle] = useState(null);
  const [huddlePeers, setHuddlePeers] = useState([]);
  const [huddlesByConv, setHuddlesByConv] = useState({});

  // Refs synced with latest state for async callbacks & timers
  const callModeRef = useRef(null);
  const callStateRef = useRef("idle");
  const callTypeRef = useRef("audio");
  const remoteUserIdRef = useRef(null);
  const remoteUserNameRef = useRef(null);
  const isCameraOffRef = useRef(false);
  const isScreenSharingRef = useRef(false);

  // WebRTC & media refs
  const peerRef = useRef(null);
  const videoSenderRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const pendingOfferSdpRef = useRef(null);
  const pendingCallTypeRef = useRef("audio");
  const iceCandidateBufferRef = useRef([]);

  // Huddle refs
  const huddleConvIdRef = useRef(null);
  const huddleRecipientsRef = useRef([]);
  const huddlePeersMapRef = useRef(new Map());

  // Timers & cached ICE servers
  const ringTimerRef = useRef(null);
  const durationTimerRef = useRef(null);
  const iceServersRef = useRef(null);
  const stopScreenShareRef = useRef(null);

  const updateCallMode = useCallback((nextMode) => {
    callModeRef.current = nextMode;
    setCallMode(nextMode);
  }, []);

  const updateCallState = useCallback((nextState) => {
    callStateRef.current = nextState;
    setCallState(nextState);
  }, []);

  const updateCallType = useCallback((nextType) => {
    callTypeRef.current = nextType;
    setCallType(nextType);
  }, []);

  const updateRemoteUser = useCallback((uid, name) => {
    remoteUserIdRef.current = uid;
    remoteUserNameRef.current = name;
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

  const startDurationTimer = useCallback(() => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
    }
    const start = Date.now();
    durationTimerRef.current = setInterval(() => {
      setCallDuration(Math.floor((Date.now() - start) / 1000));
    }, 1000);
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

  const broadcastCurrentMediaState = useCallback(
    (cameraEnabled, screenSharing) => {
      if (callModeRef.current === "huddle" && huddleConvIdRef.current) {
        sendViaWs({
          type: "huddle:media_state",
          conversationId: huddleConvIdRef.current,
          cameraEnabled,
          isScreenSharing: screenSharing,
        });
      } else if (callModeRef.current === "direct" && remoteUserIdRef.current) {
        sendViaWs({
          type: "call:media_state",
          targetUserId: remoteUserIdRef.current,
          cameraEnabled,
          isScreenSharing: screenSharing,
        });
      }
    },
    [sendViaWs],
  );

  const syncHuddlePeersState = useCallback(() => {
    setHuddlePeers(
      Array.from(huddlePeersMapRef.current.values()).map((p) => ({
        userId: p.userId,
        userName: p.userName,
        stream: p.stream || null,
        connectionState: p.connectionState || "connecting",
        cameraEnabled: Boolean(p.cameraEnabled),
        isScreenSharing: Boolean(p.isScreenSharing),
      })),
    );
  }, []);

  const stopAllMedia = useCallback(() => {
    cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
    cameraStreamRef.current = null;
    screenStreamRef.current?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    screenStreamRef.current = null;
    setLocalStream(null);
  }, []);

  const closeSinglePeer = useCallback((pc) => {
    if (!pc) return;
    pc.onicecandidate = null;
    pc.ontrack = null;
    pc.onconnectionstatechange = null;
    pc.close();
  }, []);

  const resetCall = useCallback(() => {
    clearTimers();
    closeSinglePeer(peerRef.current);
    peerRef.current = null;
    videoSenderRef.current = null;

    for (const entry of huddlePeersMapRef.current.values()) {
      closeSinglePeer(entry.pc);
    }
    huddlePeersMapRef.current.clear();
    setHuddlePeers([]);

    stopAllMedia();
    remoteStreamRef.current = null;
    setRemoteStream(null);
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }

    iceCandidateBufferRef.current = [];
    pendingOfferSdpRef.current = null;
    pendingCallTypeRef.current = "audio";
    huddleConvIdRef.current = null;
    huddleRecipientsRef.current = [];

    isCameraOffRef.current = false;
    isScreenSharingRef.current = false;
    setIsCameraOff(false);
    setIsScreenSharing(false);
    setRemoteMediaState({ cameraEnabled: false, isScreenSharing: false });

    updateCallMode(null);
    updateCallState("idle");
    updateCallType("audio");
    updateRemoteUser(null, null);
    setHuddleConvId(null);
    setHuddleTitle(null);
    setIsMuted(false);
    setCallDuration(0);
  }, [
    clearTimers,
    closeSinglePeer,
    stopAllMedia,
    updateCallMode,
    updateCallState,
    updateCallType,
    updateRemoteUser,
  ]);

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

  const preflightCheck = useCallback(
    (requireMic = true) => {
      if (callStateRef.current !== "idle") {
        toastInfo("Finish your current call before starting a new one");
        return false;
      }
      if (!wsRef?.current || wsRef.current.readyState !== WebSocket.OPEN) {
        toastError("Chat connection is offline. Please wait to reconnect.");
        return false;
      }
      if (requireMic && !navigator.mediaDevices?.getUserMedia) {
        toastError("Calling requires microphone support over HTTPS.");
        return false;
      }
      return true;
    },
    [wsRef, toastInfo, toastError],
  );

  // Keep hidden direct <audio> element bound to remoteStream audio tracks
  useEffect(() => {
    const audioEl = remoteAudioRef.current;
    if (!audioEl) return;
    if (!remoteStream) {
      audioEl.srcObject = null;
      return;
    }
    const audioTracks = remoteStream.getAudioTracks();
    audioEl.srcObject = audioTracks.length > 0 ? new MediaStream(audioTracks) : null;
    if (audioTracks.length > 0) {
      audioEl.play().catch(() => {});
    }
  }, [remoteStream]);

  // ── 1-to-1 Direct Peer Factory ───────────────────────────────
  const createDirectPeer = useCallback(
    async (targetUserId) => {
      const iceServers = await fetchIceServers();
      const pc = new RTCPeerConnection({ iceServers });

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          sendViaWs({
            type: "call:ice",
            mode: "direct",
            targetUserId,
            candidate: e.candidate.toJSON(),
          });
        }
      };

      pc.ontrack = (e) => {
        if (!remoteStreamRef.current) {
          remoteStreamRef.current = new MediaStream();
        }
        for (const existing of remoteStreamRef.current.getTracks()) {
          if (existing.kind === e.track.kind && existing.id !== e.track.id) {
            remoteStreamRef.current.removeTrack(existing);
          }
        }
        if (!remoteStreamRef.current.getTracks().some((t) => t.id === e.track.id)) {
          remoteStreamRef.current.addTrack(e.track);
        }
        setRemoteStream(new MediaStream(remoteStreamRef.current.getTracks()));
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
        if (pc.connectionState === "connected" && callStateRef.current !== "active") {
          clearTimers();
          updateCallState("active");
          startDurationTimer();
        }
      };

      peerRef.current = pc;
      return pc;
    },
    [fetchIceServers, sendViaWs, resetCall, clearTimers, updateCallState, startDurationTimer],
  );

  // ── Huddle Mesh Peer Factory (audio + pre-allocated sendrecv video transceiver) ──
  const createHuddlePeer = useCallback(
    async (peerMeta, convId, { asOfferer = true } = {}) => {
      const peerUserId = String(peerMeta.userId);
      const existing = huddlePeersMapRef.current.get(peerUserId);
      if (existing?.pc) {
        closeSinglePeer(existing.pc);
      }

      const iceServers = await fetchIceServers();
      const pc = new RTCPeerConnection({ iceServers });

      const entry = {
        userId: peerUserId,
        userName: peerMeta.userName || existing?.userName || "Teammate",
        pc,
        videoSender: null,
        iceBuffer: existing?.iceBuffer || [],
        stream: existing?.stream || new MediaStream(),
        connectionState: "connecting",
        cameraEnabled:
          peerMeta.cameraEnabled !== undefined
            ? Boolean(peerMeta.cameraEnabled)
            : Boolean(existing?.cameraEnabled),
        isScreenSharing:
          peerMeta.isScreenSharing !== undefined
            ? Boolean(peerMeta.isScreenSharing)
            : Boolean(existing?.isScreenSharing),
      };
      huddlePeersMapRef.current.set(peerUserId, entry);
      syncHuddlePeersState();

      if (asOfferer) {
        const localAudio = cameraStreamRef.current?.getAudioTracks()[0] || null;
        const activeVideo =
          screenStreamRef.current?.getVideoTracks()[0] ||
          cameraStreamRef.current?.getVideoTracks()[0] ||
          null;
        const stream = cameraStreamRef.current || new MediaStream();

        if (localAudio) {
          pc.addTrack(localAudio, stream);
        } else {
          pc.addTransceiver("audio", { direction: "sendrecv", streams: [stream] });
        }

        if (activeVideo) {
          entry.videoSender = pc.addTrack(activeVideo, stream);
        } else {
          const videoTv = pc.addTransceiver("video", {
            direction: "sendrecv",
            streams: [stream],
          });
          entry.videoSender = videoTv.sender;
        }
      }

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          sendViaWs({
            type: "call:ice",
            mode: "huddle",
            conversationId: convId,
            targetUserId: peerUserId,
            candidate: e.candidate.toJSON(),
          });
        }
      };

      pc.ontrack = (e) => {
        const cur = huddlePeersMapRef.current.get(peerUserId);
        if (!cur) return;
        if (!cur.stream) cur.stream = new MediaStream();
        for (const t of cur.stream.getTracks()) {
          if (t.kind === e.track.kind && t.id !== e.track.id) {
            cur.stream.removeTrack(t);
          }
        }
        if (!cur.stream.getTracks().some((t) => t.id === e.track.id)) {
          cur.stream.addTrack(e.track);
        }
        cur.stream = new MediaStream(cur.stream.getTracks());
        syncHuddlePeersState();
      };

      pc.onconnectionstatechange = () => {
        const cur = huddlePeersMapRef.current.get(peerUserId);
        if (!cur) return;
        cur.connectionState = pc.connectionState;
        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          closeSinglePeer(pc);
          huddlePeersMapRef.current.delete(peerUserId);
        }
        syncHuddlePeersState();
      };

      return entry;
    },
    [fetchIceServers, closeSinglePeer, syncHuddlePeersState, sendViaWs],
  );

  // ── 1-to-1 Direct Call Actions ───────────────────────────────
  const startCall = useCallback(
    async (targetUserId, targetUserName, { video = false } = {}) => {
      if (!targetUserId || !preflightCheck(true)) return;

      const requestedType = video ? "video" : "audio";
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: video ? DIRECT_VIDEO_CONSTRAINTS : false,
        });
        cameraStreamRef.current = stream;
        setLocalStream(stream);
        isCameraOffRef.current = !video;
        setIsCameraOff(!video);

        updateCallMode("direct");
        updateCallType(requestedType);
        updateCallState("outgoing-ringing");
        updateRemoteUser(targetUserId, targetUserName);
        setRemoteMediaState({ cameraEnabled: video, isScreenSharing: false });

        const pc = await createDirectPeer(targetUserId);
        stream.getTracks().forEach((track) => {
          const sender = pc.addTrack(track, stream);
          if (track.kind === "video") {
            videoSenderRef.current = sender;
          }
        });

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        sendViaWs({
          type: "call:offer",
          mode: "direct",
          callType: requestedType,
          targetUserId,
          sdp: pc.localDescription.toJSON(),
        });

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
            ? `${video ? "Camera/microphone" : "Microphone"} permission denied.`
            : err?.name === "NotFoundError"
              ? `No ${video ? "camera or microphone" : "microphone"} detected on this device.`
              : "Could not start call.";
        toastError(msg);
        resetCall();
      }
    },
    [
      preflightCheck,
      updateCallMode,
      updateCallType,
      updateCallState,
      updateRemoteUser,
      createDirectPeer,
      sendViaWs,
      resetCall,
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
    const wantsVideo = pendingCallTypeRef.current === "video";

    try {
      let stream;
      let hasLocalCamera = wantsVideo;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: wantsVideo ? DIRECT_VIDEO_CONSTRAINTS : false,
        });
      } catch (mediaErr) {
        if (
          wantsVideo &&
          (mediaErr?.name === "NotFoundError" || mediaErr?.name === "OverconstrainedError")
        ) {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          hasLocalCamera = false;
          toastInfo("No camera found — joined with microphone only");
        } else {
          throw mediaErr;
        }
      }

      isCameraOffRef.current = !hasLocalCamera;
      setIsCameraOff(!hasLocalCamera);
      cameraStreamRef.current = stream;
      setLocalStream(stream);
      updateCallState("connecting");

      const pc = await createDirectPeer(targetId);
      stream.getTracks().forEach((track) => {
        const sender = pc.addTrack(track, stream);
        if (track.kind === "video") {
          videoSenderRef.current = sender;
        }
      });

      await pc.setRemoteDescription(new RTCSessionDescription(pendingOfferSdpRef.current));
      pendingOfferSdpRef.current = null;

      await drainIceCandidates(pc, iceCandidateBufferRef.current);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      sendViaWs({
        type: "call:answer",
        mode: "direct",
        callType: pendingCallTypeRef.current,
        targetUserId: targetId,
        sdp: pc.localDescription.toJSON(),
      });

      sendViaWs({
        type: "call:media_state",
        targetUserId: targetId,
        cameraEnabled: hasLocalCamera,
        isScreenSharing: false,
      });
    } catch (err) {
      console.error("[Call] acceptCall failed:", err);
      toastError(
        err?.name === "NotAllowedError"
          ? "Microphone/camera permission denied."
          : "Failed to connect call.",
      );
      sendViaWs({ type: "call:reject", targetUserId: targetId });
      resetCall();
    }
  }, [clearTimers, createDirectPeer, sendViaWs, resetCall, updateCallState, toastError, toastInfo]);

  const rejectCall = useCallback(() => {
    const targetId = remoteUserIdRef.current;
    if (targetId) {
      sendViaWs({ type: "call:reject", targetUserId: targetId });
    }
    resetCall();
  }, [sendViaWs, resetCall]);

  // ── Media Toggles (Mute, Camera, Screen Share — Direct & Huddle) ──
  const replaceVideoAcrossActivePeers = useCallback(async (track) => {
    if (callModeRef.current === "huddle") {
      await Promise.all(
        Array.from(huddlePeersMapRef.current.values()).map(async (entry) => {
          if (entry.videoSender) {
            try {
              await entry.videoSender.replaceTrack(track);
            } catch {
              // Ignore closed sender
            }
          }
        }),
      );
    } else if (callModeRef.current === "direct" && videoSenderRef.current) {
      try {
        await videoSenderRef.current.replaceTrack(track);
      } catch {
        // Ignore closed sender
      }
    }
  }, []);

  const toggleMute = useCallback(() => {
    const track = cameraStreamRef.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setIsMuted(!track.enabled);
    }
  }, []);

  const toggleCamera = useCallback(async () => {
    let videoTrack = cameraStreamRef.current?.getVideoTracks()[0] || null;

    // Acquire camera on the fly if user joined a voice huddle (or camera-less call)
    if (!videoTrack) {
      if (callModeRef.current !== "huddle") {
        toastInfo("No camera active in this call");
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        toastError("Camera access is not supported in this browser.");
        return;
      }
      try {
        const camStream = await navigator.mediaDevices.getUserMedia({
          video: GROUP_VIDEO_CONSTRAINTS,
          audio: false,
        });
        videoTrack = camStream.getVideoTracks()[0];
        if (!videoTrack) return;

        if (!cameraStreamRef.current) {
          cameraStreamRef.current = new MediaStream();
        }
        cameraStreamRef.current.addTrack(videoTrack);

        if (!isScreenSharingRef.current) {
          await replaceVideoAcrossActivePeers(videoTrack);
          setLocalStream(new MediaStream(cameraStreamRef.current.getTracks()));
        }

        isCameraOffRef.current = false;
        setIsCameraOff(false);
        broadcastCurrentMediaState(true, isScreenSharingRef.current);
      } catch (err) {
        toastError(
          err?.name === "NotAllowedError"
            ? "Camera permission denied."
            : "No camera found on this device.",
        );
      }
      return;
    }

    const nextEnabled = !videoTrack.enabled;
    videoTrack.enabled = nextEnabled;
    isCameraOffRef.current = !nextEnabled;
    setIsCameraOff(!nextEnabled);

    if (!isScreenSharingRef.current && cameraStreamRef.current) {
      setLocalStream(new MediaStream(cameraStreamRef.current.getTracks()));
    }
    broadcastCurrentMediaState(nextEnabled, isScreenSharingRef.current);
  }, [broadcastCurrentMediaState, replaceVideoAcrossActivePeers, toastInfo, toastError]);

  const stopScreenShare = useCallback(async () => {
    if (!isScreenSharingRef.current) return;

    screenStreamRef.current?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    screenStreamRef.current = null;

    const cameraTrack = cameraStreamRef.current?.getVideoTracks()[0] || null;
    await replaceVideoAcrossActivePeers(
      cameraTrack && cameraTrack.readyState === "live" ? cameraTrack : null,
    );

    if (cameraStreamRef.current) {
      setLocalStream(new MediaStream(cameraStreamRef.current.getTracks()));
    }

    isScreenSharingRef.current = false;
    setIsScreenSharing(false);
    broadcastCurrentMediaState(
      Boolean(cameraTrack && !isCameraOffRef.current),
      false,
    );
  }, [broadcastCurrentMediaState, replaceVideoAcrossActivePeers]);

  useEffect(() => {
    stopScreenShareRef.current = stopScreenShare;
  }, [stopScreenShare]);

  const toggleScreenShare = useCallback(async () => {
    if (callStateRef.current !== "active") return;
    if (isScreenSharingRef.current) {
      await stopScreenShare();
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      toastError("Screen sharing is not supported in this browser.");
      return;
    }

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 15, max: 30 } },
        audio: false,
      });
      const screenTrack = screenStream.getVideoTracks()[0];
      if (!screenTrack) {
        screenStream.getTracks().forEach((t) => t.stop());
        return;
      }

      screenStreamRef.current = screenStream;
      screenTrack.onended = () => {
        void stopScreenShareRef.current?.();
      };

      if (callModeRef.current === "huddle") {
        await replaceVideoAcrossActivePeers(screenTrack);
      } else {
        const pc = peerRef.current;
        const targetId = remoteUserIdRef.current;
        if (!pc || !targetId) {
          screenStream.getTracks().forEach((t) => t.stop());
          return;
        }

        if (videoSenderRef.current) {
          await videoSenderRef.current.replaceTrack(screenTrack);
        } else {
          videoSenderRef.current = pc.addTrack(screenTrack, screenStream);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          sendViaWs({
            type: "call:offer",
            mode: "renegotiate",
            callType: "video",
            targetUserId: targetId,
            sdp: pc.localDescription.toJSON(),
          });
        }
      }

      const audioTracks = cameraStreamRef.current?.getAudioTracks() || [];
      setLocalStream(new MediaStream([...audioTracks, screenTrack]));

      isScreenSharingRef.current = true;
      setIsScreenSharing(true);
      broadcastCurrentMediaState(!isCameraOffRef.current, true);
    } catch (err) {
      if (err?.name !== "AbortError" && err?.name !== "NotAllowedError") {
        console.error("[Call] Screen share error:", err);
        toastError("Failed to start screen sharing.");
      }
    }
  }, [
    stopScreenShare,
    replaceVideoAcrossActivePeers,
    sendViaWs,
    broadcastCurrentMediaState,
    toastError,
  ]);

  // ── Group Huddle Actions (Mesh up to 5 people) ───────────────
  const joinHuddle = useCallback(
    async (conversationId, title, recipientIds = [], { video = false } = {}) => {
      if (!conversationId || !preflightCheck(true)) return;

      try {
        let stream;
        let cameraOn = video;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: video ? GROUP_VIDEO_CONSTRAINTS : false,
          });
        } catch (mediaErr) {
          if (
            video &&
            (mediaErr?.name === "NotFoundError" || mediaErr?.name === "OverconstrainedError")
          ) {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            cameraOn = false;
            toastInfo("No camera found — joined huddle with audio only");
          } else {
            throw mediaErr;
          }
        }

        cameraStreamRef.current = stream;
        setLocalStream(stream);
        isCameraOffRef.current = !cameraOn;
        setIsCameraOff(!cameraOn);

        huddleConvIdRef.current = String(conversationId);
        huddleRecipientsRef.current = recipientIds.map(String);

        updateCallMode("huddle");
        updateCallType(cameraOn ? "video" : "audio");
        updateCallState("connecting");
        setHuddleConvId(String(conversationId));
        setHuddleTitle(title || "Team Huddle");

        sendViaWs({
          type: "huddle:join",
          conversationId: String(conversationId),
          recipientIds,
          cameraEnabled: cameraOn,
          isScreenSharing: false,
        });
      } catch (err) {
        console.error("[Huddle] joinHuddle failed:", err);
        toastError(
          err?.name === "NotAllowedError"
            ? `${video ? "Camera/microphone" : "Microphone"} permission denied.`
            : "Could not join huddle.",
        );
        resetCall();
      }
    },
    [
      preflightCheck,
      updateCallMode,
      updateCallType,
      updateCallState,
      sendViaWs,
      resetCall,
      toastError,
      toastInfo,
    ],
  );

  const leaveHuddle = useCallback(() => {
    const convId = huddleConvIdRef.current;
    if (convId) {
      sendViaWs({
        type: "huddle:leave",
        conversationId: convId,
        recipientIds: huddleRecipientsRef.current,
      });
    }
    resetCall();
  }, [sendViaWs, resetCall]);

  const hangUp = useCallback(() => {
    if (callModeRef.current === "huddle") {
      leaveHuddle();
      return;
    }
    const targetId = remoteUserIdRef.current;
    if (targetId) {
      sendViaWs({ type: "call:hangup", targetUserId: targetId });
    }
    resetCall();
  }, [leaveHuddle, sendViaWs, resetCall]);

  // ── Incoming WS Event Handler (wired by CallEventWire) ───────
  const handleCallEvent = useCallback(
    async (event) => {
      if (!event?.type) return;

      switch (event.type) {
        case "chat:connected":
        case "huddle:snapshot": {
          if (event.activeHuddles && typeof event.activeHuddles === "object") {
            setHuddlesByConv(event.activeHuddles);
          }
          break;
        }

        case "huddle:status": {
          const cid = String(event.conversationId || "");
          if (!cid) return;
          setHuddlesByConv((prev) => {
            const list = Array.isArray(event.participants) ? event.participants : [];
            if (list.length === 0) {
              const next = { ...prev };
              delete next[cid];
              return next;
            }
            return { ...prev, [cid]: list };
          });
          break;
        }

        case "huddle:started": {
          if (callStateRef.current === "idle" && event.startedByName) {
            toastInfo(`${event.startedByName} started a huddle`);
          }
          break;
        }

        case "huddle:full": {
          toastInfo(`Huddle is full (max ${event.maxParticipants || 5} participants)`);
          resetCall();
          break;
        }

        case "huddle:joined": {
          if (
            callModeRef.current !== "huddle" ||
            String(event.conversationId) !== huddleConvIdRef.current
          ) {
            return;
          }
          updateCallState("active");
          startDurationTimer();

          const peers = Array.isArray(event.peers) ? event.peers : [];
          for (const peer of peers) {
            try {
              const entry = await createHuddlePeer(
                peer,
                huddleConvIdRef.current,
                { asOfferer: true },
              );
              const offer = await entry.pc.createOffer();
              await entry.pc.setLocalDescription(offer);
              sendViaWs({
                type: "call:offer",
                mode: "huddle",
                conversationId: huddleConvIdRef.current,
                targetUserId: peer.userId,
                sdp: entry.pc.localDescription.toJSON(),
              });
            } catch (err) {
              console.error("[Huddle] Offer to peer failed:", err);
            }
          }
          break;
        }

        case "huddle:peer_joined": {
          if (
            callModeRef.current !== "huddle" ||
            String(event.conversationId) !== huddleConvIdRef.current
          ) {
            return;
          }
          if (!huddlePeersMapRef.current.has(event.userId)) {
            huddlePeersMapRef.current.set(event.userId, {
              userId: event.userId,
              userName: event.userName || "Teammate",
              pc: null,
              videoSender: null,
              iceBuffer: [],
              stream: new MediaStream(),
              connectionState: "connecting",
              cameraEnabled: Boolean(event.cameraEnabled),
              isScreenSharing: Boolean(event.isScreenSharing),
            });
            syncHuddlePeersState();
          }
          break;
        }

        case "huddle:peer_media": {
          if (
            callModeRef.current !== "huddle" ||
            String(event.conversationId) !== huddleConvIdRef.current
          ) {
            return;
          }
          const entry = huddlePeersMapRef.current.get(event.userId);
          if (entry) {
            entry.cameraEnabled = Boolean(event.cameraEnabled);
            entry.isScreenSharing = Boolean(event.isScreenSharing);
            syncHuddlePeersState();
          }
          break;
        }

        case "huddle:peer_left": {
          if (
            callModeRef.current !== "huddle" ||
            String(event.conversationId) !== huddleConvIdRef.current
          ) {
            return;
          }
          const entry = huddlePeersMapRef.current.get(event.userId);
          if (entry) {
            closeSinglePeer(entry.pc);
            huddlePeersMapRef.current.delete(event.userId);
            syncHuddlePeersState();
          }
          break;
        }

        case "call:offer": {
          // ── Case A: Group Huddle Mesh Offer ──
          if (event.mode === "huddle") {
            if (
              callModeRef.current !== "huddle" ||
              String(event.conversationId) !== huddleConvIdRef.current
            ) {
              return;
            }
            try {
              const entry = await createHuddlePeer(
                { userId: event.fromUserId, userName: event.fromUserName },
                event.conversationId,
                { asOfferer: false },
              );
              await entry.pc.setRemoteDescription(new RTCSessionDescription(event.sdp));

              // Bind local audio + video/screen tracks to transceivers created by offer
              const localAudio = cameraStreamRef.current?.getAudioTracks()[0] || null;
              const activeVideo =
                screenStreamRef.current?.getVideoTracks()[0] ||
                cameraStreamRef.current?.getVideoTracks()[0] ||
                null;

              for (const tv of entry.pc.getTransceivers()) {
                const kind = tv.receiver?.track?.kind || tv.sender?.track?.kind;
                if (kind === "audio") {
                  tv.direction = "sendrecv";
                  if (localAudio) await tv.sender.replaceTrack(localAudio);
                } else if (kind === "video") {
                  tv.direction = "sendrecv";
                  entry.videoSender = tv.sender;
                  if (activeVideo) await tv.sender.replaceTrack(activeVideo);
                }
              }

              await drainIceCandidates(entry.pc, entry.iceBuffer);
              const answer = await entry.pc.createAnswer();
              await entry.pc.setLocalDescription(answer);
              sendViaWs({
                type: "call:answer",
                mode: "huddle",
                conversationId: event.conversationId,
                targetUserId: event.fromUserId,
                sdp: entry.pc.localDescription.toJSON(),
              });
            } catch (err) {
              console.error("[Huddle] Handle offer failed:", err);
            }
            return;
          }

          // ── Case B: Mid-call Renegotiation (screen share added on audio call) ──
          if (
            event.mode === "renegotiate" &&
            callModeRef.current === "direct" &&
            callStateRef.current === "active" &&
            event.fromUserId === remoteUserIdRef.current &&
            peerRef.current
          ) {
            try {
              await peerRef.current.setRemoteDescription(new RTCSessionDescription(event.sdp));
              const answer = await peerRef.current.createAnswer();
              await peerRef.current.setLocalDescription(answer);
              sendViaWs({
                type: "call:answer",
                mode: "renegotiate",
                targetUserId: event.fromUserId,
                sdp: peerRef.current.localDescription.toJSON(),
              });
            } catch (err) {
              console.error("[Call] Renegotiation failed:", err);
            }
            return;
          }

          // ── Case C: New 1-to-1 Incoming Call ──
          if (callStateRef.current !== "idle") {
            sendViaWs({ type: "call:busy", targetUserId: event.fromUserId });
            return;
          }

          const incomingType = event.callType === "video" ? "video" : "audio";
          pendingOfferSdpRef.current = event.sdp;
          pendingCallTypeRef.current = incomingType;
          iceCandidateBufferRef.current = [];

          updateCallMode("direct");
          updateCallType(incomingType);
          updateRemoteUser(event.fromUserId, event.fromUserName);
          setRemoteMediaState({
            cameraEnabled: incomingType === "video",
            isScreenSharing: false,
          });
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
          if (event.mode === "huddle") {
            const entry = huddlePeersMapRef.current.get(event.fromUserId);
            if (!entry?.pc) return;
            try {
              await entry.pc.setRemoteDescription(new RTCSessionDescription(event.sdp));
              await drainIceCandidates(entry.pc, entry.iceBuffer);
            } catch (err) {
              console.error("[Huddle] setRemoteDescription failed:", err);
            }
            return;
          }

          if (!peerRef.current || event.fromUserId !== remoteUserIdRef.current) {
            return;
          }
          if (event.mode === "renegotiate") {
            try {
              await peerRef.current.setRemoteDescription(new RTCSessionDescription(event.sdp));
            } catch (err) {
              console.error("[Call] Renegotiate answer failed:", err);
            }
            return;
          }

          clearTimers();
          try {
            await peerRef.current.setRemoteDescription(new RTCSessionDescription(event.sdp));
            await drainIceCandidates(peerRef.current, iceCandidateBufferRef.current);
            if (callStateRef.current !== "active") {
              updateCallState("connecting");
            }
          } catch (err) {
            console.error("[Call] setRemoteDescription failed:", err);
            resetCall();
          }
          break;
        }

        case "call:ice": {
          if (event.mode === "huddle") {
            const entry = huddlePeersMapRef.current.get(event.fromUserId);
            if (!entry) return;
            if (entry.pc && entry.pc.remoteDescription) {
              try {
                await entry.pc.addIceCandidate(new RTCIceCandidate(event.candidate));
              } catch {
                // Skip invalid candidate
              }
            } else {
              entry.iceBuffer.push(event.candidate);
            }
            return;
          }

          if (event.fromUserId !== remoteUserIdRef.current) return;
          if (peerRef.current && peerRef.current.remoteDescription) {
            try {
              await peerRef.current.addIceCandidate(new RTCIceCandidate(event.candidate));
            } catch {
              // Skip invalid candidate
            }
          } else {
            iceCandidateBufferRef.current.push(event.candidate);
          }
          break;
        }

        case "call:media_state": {
          if (event.fromUserId !== remoteUserIdRef.current) return;
          setRemoteMediaState({
            cameraEnabled: Boolean(event.cameraEnabled),
            isScreenSharing: Boolean(event.isScreenSharing),
          });
          break;
        }

        case "call:reject": {
          if (event.fromUserId !== remoteUserIdRef.current) return;
          toastInfo(`${remoteUserNameRef.current || "User"} declined the call`);
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
          toastInfo(`${remoteUserNameRef.current || "User"} is busy on another call`);
          resetCall();
          break;
        }

        case "call:unavailable": {
          if (event.targetUserId !== remoteUserIdRef.current) return;
          toastInfo(`${remoteUserNameRef.current || "User"} is currently offline`);
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
      updateCallMode,
      updateCallType,
      updateRemoteUser,
      updateCallState,
      startDurationTimer,
      createHuddlePeer,
      syncHuddlePeersState,
      closeSinglePeer,
      toastInfo,
    ],
  );

  const handleCallEventRef = useRef(handleCallEvent);
  useEffect(() => {
    handleCallEventRef.current = handleCallEvent;
  }, [handleCallEvent]);

  // Unlock Web Audio on first user interaction
  useEffect(() => {
    const handleUnlock = () => unlockCallAudio();
    window.addEventListener("pointerdown", handleUnlock, { once: true, passive: true });
    window.addEventListener("keydown", handleUnlock, { once: true, passive: true });
    return () => {
      window.removeEventListener("pointerdown", handleUnlock);
      window.removeEventListener("keydown", handleUnlock);
    };
  }, []);

  // Play incoming ringtone or outgoing ringback tone
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
      callMode,
      callState,
      callType,
      remoteUserId,
      remoteUserName,
      localStream,
      remoteStream,
      isMuted,
      isCameraOff,
      isScreenSharing,
      remoteMediaState,
      callDuration,
      huddleConvId,
      huddleTitle,
      huddlePeers,
      huddlesByConv,
      startCall,
      acceptCall,
      rejectCall,
      hangUp,
      toggleMute,
      toggleCamera,
      toggleScreenShare,
      joinHuddle,
      leaveHuddle,
      handleCallEventRef,
    }),
    [
      callMode,
      callState,
      callType,
      remoteUserId,
      remoteUserName,
      localStream,
      remoteStream,
      isMuted,
      isCameraOff,
      isScreenSharing,
      remoteMediaState,
      callDuration,
      huddleConvId,
      huddleTitle,
      huddlePeers,
      huddlesByConv,
      startCall,
      acceptCall,
      rejectCall,
      hangUp,
      toggleMute,
      toggleCamera,
      toggleScreenShare,
      joinHuddle,
      leaveHuddle,
    ],
  );

  return (
    <CallContext.Provider value={value}>
      {children}
      <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: "none" }} />
      {callMode === "huddle" &&
        huddlePeers.map((peer) => (
          <HuddlePeerAudio key={peer.userId} stream={peer.stream} />
        ))}
    </CallContext.Provider>
  );
}
