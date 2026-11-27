import { useEffect, useRef, useState } from "react";
import { useCall } from "../../hooks/useCall";
import { Avatar } from "../common/Avatar";
import {
  MaximizeIcon,
  MicIcon,
  MicOffIcon,
  MinimizeIcon,
  PhoneOffIcon,
  ScreenShareIcon,
  UsersIcon,
  VideoIcon,
  VideoOffIcon,
} from "../common/Icons";

function formatTime(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function VideoStreamView({ stream, mirrored = false, className = "" }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = stream || null;
    if (stream) {
      el.play().catch(() => {});
    }
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className={`${mirrored ? "-scale-x-100" : ""} ${className}`}
    />
  );
}

export default function ActiveCallOverlay() {
  const {
    callMode,
    callState,
    callType,
    remoteUserName,
    localStream,
    remoteStream,
    isMuted,
    isCameraOff,
    isScreenSharing,
    remoteMediaState,
    callDuration,
    huddleTitle,
    huddlePeers,
    hangUp,
    toggleMute,
    toggleCamera,
    toggleScreenShare,
  } = useCall();

  const [isExpanded, setIsExpanded] = useState(false);

  if (
    callState !== "outgoing-ringing" &&
    callState !== "connecting" &&
    callState !== "active"
  ) {
    return null;
  }

  const statusText =
    callState === "outgoing-ringing"
      ? "Ringing…"
      : callState === "connecting"
        ? "Connecting…"
        : formatTime(callDuration);

  // ── Group Huddle (up to 5 people — Voice OR Video/Screen Grid) ──
  if (callMode === "huddle") {
    const localVideoOn =
      Boolean(localStream?.getVideoTracks()?.length) && (!isCameraOff || isScreenSharing);
    const anyRemoteVideoOn = huddlePeers.some(
      (p) => (p.cameraEnabled || p.isScreenSharing) && p.stream?.getVideoTracks()?.length,
    );
    const showGroupVideoGrid = localVideoOn || anyRemoteVideoOn || callType === "video";

    if (showGroupVideoGrid) {
      const totalCount = huddlePeers.length + 1;
      const gridColsClass =
        totalCount <= 1
          ? "grid-cols-1"
          : totalCount <= 4
            ? "grid-cols-2"
            : isExpanded
              ? "grid-cols-2 md:grid-cols-3"
              : "grid-cols-2";

      return (
        <div
          className={
            isExpanded
              ? "fixed inset-4 z-[9998] flex flex-col overflow-hidden rounded-2xl border border-border bg-zinc-950 shadow-2xl"
              : "fixed bottom-6 right-6 z-[9998] flex w-88 sm:w-[430px] flex-col overflow-hidden rounded-2xl border border-border bg-zinc-950 shadow-2xl"
          }
        >
          {/* Top bar */}
          <div className="flex items-center justify-between gap-2 bg-black/50 px-3.5 py-2 text-white">
            <div className="flex items-center gap-2 min-w-0">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <span className="truncate text-xs font-semibold">
                {huddleTitle || "Team Huddle"}
              </span>
              <span className="text-[11px] text-zinc-300 shrink-0">
                {statusText} · {totalCount}/5
              </span>
            </div>

            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              className="rounded p-1 text-zinc-300 hover:bg-white/10 hover:text-white cursor-pointer"
              title={isExpanded ? "Minimize" : "Expand"}
            >
              {isExpanded ? (
                <MinimizeIcon className="h-4 w-4" />
              ) : (
                <MaximizeIcon className="h-4 w-4" />
              )}
            </button>
          </div>

          {/* Video Grid */}
          <div
            className={`grid gap-2 p-2.5 bg-zinc-900 overflow-y-auto ${gridColsClass} ${
              isExpanded ? "flex-1 min-h-0 auto-rows-fr" : "max-h-72"
            }`}
          >
            {/* Local tile */}
            <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-zinc-800">
              {localVideoOn ? (
                <VideoStreamView
                  stream={localStream}
                  mirrored={!isScreenSharing}
                  className={`h-full w-full ${
                    isScreenSharing ? "object-contain bg-black" : "object-cover"
                  }`}
                />
              ) : (
                <div className="flex flex-col items-center gap-1.5 text-zinc-300">
                  <Avatar user={{ name: "You" }} size="md" showTooltip={false} />
                  <span className="text-[11px]">Camera off</span>
                </div>
              )}
              <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">
                You {isMuted ? "(muted)" : ""}
              </span>
            </div>

            {/* Remote participant tiles */}
            {huddlePeers.map((peer) => {
              const peerVideoOn =
                (peer.cameraEnabled || peer.isScreenSharing) &&
                Boolean(peer.stream?.getVideoTracks()?.length);
              return (
                <div
                  key={peer.userId}
                  className={`relative flex aspect-video items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-zinc-800 ${
                    peer.isScreenSharing && isExpanded ? "col-span-full" : ""
                  }`}
                >
                  {peerVideoOn ? (
                    <VideoStreamView
                      stream={peer.stream}
                      className={`h-full w-full ${
                        peer.isScreenSharing ? "object-contain bg-black" : "object-cover"
                      }`}
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-1.5 text-zinc-300">
                      <Avatar
                        user={{ name: peer.userName || "Teammate" }}
                        size="md"
                        showTooltip={false}
                      />
                      <span className="text-[11px]">
                        {peer.connectionState === "connected" ? "Camera off" : "Connecting…"}
                      </span>
                    </div>
                  )}
                  <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        peer.connectionState === "connected"
                          ? "bg-emerald-400"
                          : "bg-amber-400"
                      }`}
                    />
                    {peer.userName?.split(" ")[0] || "Teammate"}
                    {peer.isScreenSharing ? " · Screen" : ""}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Controls bar */}
          <div className="flex items-center justify-center gap-3 bg-black/70 px-4 py-3">
            <button
              type="button"
              onClick={toggleMute}
              className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors cursor-pointer ${
                isMuted
                  ? "bg-amber-500 text-white"
                  : "bg-white/15 text-white hover:bg-white/25"
              }`}
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? <MicOffIcon className="h-4 w-4" /> : <MicIcon className="h-4 w-4" />}
            </button>

            <button
              type="button"
              onClick={toggleCamera}
              className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors cursor-pointer ${
                isCameraOff
                  ? "bg-white/15 text-white hover:bg-white/25"
                  : "bg-emerald-600 text-white hover:bg-emerald-700"
              }`}
              title={isCameraOff ? "Turn camera on" : "Turn camera off"}
            >
              {isCameraOff ? (
                <VideoOffIcon className="h-4 w-4" />
              ) : (
                <VideoIcon className="h-4 w-4" />
              )}
            </button>

            <button
              type="button"
              onClick={toggleScreenShare}
              className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors cursor-pointer ${
                isScreenSharing
                  ? "bg-emerald-600 text-white"
                  : "bg-white/15 text-white hover:bg-white/25"
              }`}
              title={isScreenSharing ? "Stop sharing screen" : "Share screen"}
            >
              <ScreenShareIcon className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={hangUp}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-red-600 text-white transition-transform hover:scale-105 active:scale-95 cursor-pointer"
              title="Leave huddle"
            >
              <PhoneOffIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      );
    }

    // Compact Voice-Only Huddle Bar (with quick Camera + Screen Share toggles)
    return (
      <div className="fixed bottom-6 right-6 z-[9998] w-80 rounded-2xl border border-border bg-surface p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </span>
              <p className="truncate text-sm font-semibold text-text-primary">
                {huddleTitle || "Team Huddle"}
              </p>
            </div>
            <p className="mt-0.5 text-xs text-text-secondary">
              {statusText} · {huddlePeers.length + 1}/5 in call
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={toggleMute}
              className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors cursor-pointer ${
                isMuted
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                  : "bg-surface-subtle text-text-secondary hover:text-text-primary"
              }`}
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? <MicOffIcon className="h-4 w-4" /> : <MicIcon className="h-4 w-4" />}
            </button>

            <button
              type="button"
              onClick={toggleCamera}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-subtle text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
              title="Turn camera on"
            >
              <VideoIcon className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={toggleScreenShare}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-subtle text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
              title="Share screen"
            >
              <ScreenShareIcon className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={hangUp}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-red-600 text-white transition-transform hover:scale-110 active:scale-95 cursor-pointer"
              title="Leave huddle"
            >
              <PhoneOffIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border-subtle pt-2.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand">
            You {isMuted ? "(muted)" : ""}
          </span>
          {huddlePeers.map((peer) => (
            <span
              key={peer.userId}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-subtle px-2 py-0.5 text-[11px] text-text-secondary"
              title={peer.connectionState}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  peer.connectionState === "connected" ? "bg-emerald-500" : "bg-amber-500"
                }`}
              />
              {peer.userName?.split(" ")[0] || "Teammate"}
            </span>
          ))}
          {huddlePeers.length === 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] text-text-tertiary">
              <UsersIcon className="h-3 w-3" /> Waiting for teammates to join…
            </span>
          )}
        </div>
      </div>
    );
  }

  // ── 1-to-1 Video / Screen Share Stage ───────────────────────
  const hasRemoteVideoTrack = Boolean(remoteStream?.getVideoTracks()?.length);
  const showRemoteVideo =
    hasRemoteVideoTrack &&
    (remoteMediaState.cameraEnabled || remoteMediaState.isScreenSharing || callType === "video");
  const hasLocalVideo = Boolean(localStream?.getVideoTracks()?.length);
  const showLocalPreview = hasLocalVideo && (!isCameraOff || isScreenSharing);

  const showVideoStage =
    callType === "video" ||
    isScreenSharing ||
    remoteMediaState.isScreenSharing ||
    hasRemoteVideoTrack;

  if (showVideoStage) {
    return (
      <div
        className={
          isExpanded
            ? "fixed inset-4 z-[9998] flex flex-col overflow-hidden rounded-2xl border border-border bg-zinc-950 shadow-2xl"
            : "fixed bottom-6 right-6 z-[9998] flex w-80 sm:w-96 flex-col overflow-hidden rounded-2xl border border-border bg-zinc-950 shadow-2xl"
        }
      >
        {/* Top bar */}
        <div className="flex items-center justify-between gap-2 bg-black/50 px-3.5 py-2 text-white">
          <div className="flex items-center gap-2 min-w-0">
            {callState === "active" && (
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            )}
            <span className="truncate text-xs font-semibold">
              {remoteUserName || "Call"}
            </span>
            <span className="text-[11px] text-zinc-300 shrink-0">{statusText}</span>
            {remoteMediaState.isScreenSharing && (
              <span className="rounded bg-brand/80 px-1.5 py-0.5 text-[10px] font-medium text-white shrink-0">
                Screen
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="rounded p-1 text-zinc-300 hover:bg-white/10 hover:text-white cursor-pointer"
            title={isExpanded ? "Minimize" : "Expand"}
          >
            {isExpanded ? (
              <MinimizeIcon className="h-4 w-4" />
            ) : (
              <MaximizeIcon className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Video stage */}
        <div
          className={`relative flex items-center justify-center bg-zinc-900 ${
            isExpanded ? "flex-1 min-h-0" : "h-56"
          }`}
        >
          {showRemoteVideo ? (
            <VideoStreamView
              stream={remoteStream}
              className={`h-full w-full ${
                remoteMediaState.isScreenSharing ? "object-contain" : "object-cover"
              }`}
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-zinc-400">
              <Avatar user={{ name: remoteUserName || "User" }} size="lg" showTooltip={false} />
              <span className="text-xs">
                {callState === "active" ? "Camera is off" : statusText}
              </span>
            </div>
          )}

          {/* Local self-preview PiP */}
          {showLocalPreview && (
            <div
              className={`absolute bottom-2.5 right-2.5 overflow-hidden rounded-lg border border-white/20 bg-black shadow-lg ${
                isExpanded ? "h-36 w-48" : "h-16 w-24"
              }`}
            >
              <VideoStreamView
                stream={localStream}
                mirrored={!isScreenSharing}
                className="h-full w-full object-cover"
              />
            </div>
          )}
        </div>

        {/* Bottom Controls */}
        <div className="flex items-center justify-center gap-3 bg-black/70 px-4 py-3">
          <button
            type="button"
            onClick={toggleMute}
            className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors cursor-pointer ${
              isMuted
                ? "bg-amber-500 text-white"
                : "bg-white/15 text-white hover:bg-white/25"
            }`}
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <MicOffIcon className="h-4 w-4" /> : <MicIcon className="h-4 w-4" />}
          </button>

          {callType === "video" && (
            <button
              type="button"
              onClick={toggleCamera}
              className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors cursor-pointer ${
                isCameraOff
                  ? "bg-amber-500 text-white"
                  : "bg-white/15 text-white hover:bg-white/25"
              }`}
              title={isCameraOff ? "Turn camera on" : "Turn camera off"}
            >
              {isCameraOff ? (
                <VideoOffIcon className="h-4 w-4" />
              ) : (
                <VideoIcon className="h-4 w-4" />
              )}
            </button>
          )}

          {callState === "active" && (
            <button
              type="button"
              onClick={toggleScreenShare}
              className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors cursor-pointer ${
                isScreenSharing
                  ? "bg-emerald-600 text-white"
                  : "bg-white/15 text-white hover:bg-white/25"
              }`}
              title={isScreenSharing ? "Stop sharing screen" : "Share screen"}
            >
              <ScreenShareIcon className="h-4 w-4" />
            </button>
          )}

          <button
            type="button"
            onClick={hangUp}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-red-600 text-white transition-transform hover:scale-105 active:scale-95 cursor-pointer"
            title="End call"
          >
            <PhoneOffIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  // ── 1-to-1 Voice-Only Floating Bar ──────────────────────────
  return (
    <div className="fixed bottom-6 right-6 z-[9998] flex items-center gap-3 rounded-2xl border border-border bg-surface px-5 py-3 shadow-2xl">
      {callState === "active" && (
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
        </span>
      )}

      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-text-primary">
          {remoteUserName || "Call"}
        </p>
        <p className="text-xs text-text-secondary">{statusText}</p>
      </div>

      <button
        type="button"
        onClick={toggleMute}
        className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors cursor-pointer ${
          isMuted
            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
            : "bg-surface-subtle text-text-secondary hover:text-text-primary"
        }`}
        title={isMuted ? "Unmute" : "Mute"}
      >
        {isMuted ? (
          <MicOffIcon className="h-4 w-4" />
        ) : (
          <MicIcon className="h-4 w-4" />
        )}
      </button>

      {callState === "active" && (
        <button
          type="button"
          onClick={toggleScreenShare}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-subtle text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
          title="Share screen"
        >
          <ScreenShareIcon className="h-4 w-4" />
        </button>
      )}

      <button
        type="button"
        onClick={hangUp}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-red-600 text-white transition-transform hover:scale-110 active:scale-95 cursor-pointer"
        title="End call"
      >
        <PhoneOffIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
