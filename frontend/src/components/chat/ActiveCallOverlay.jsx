import { useCall } from "../../hooks/useCall";
import { PhoneOffIcon, MicIcon, MicOffIcon } from "../common/Icons";

function formatTime(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export default function ActiveCallOverlay() {
  const {
    callState,
    remoteUserName,
    isMuted,
    callDuration,
    hangUp,
    toggleMute,
  } = useCall();

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

  return (
    <div className="fixed bottom-6 right-6 z-[9998] flex items-center gap-3 rounded-2xl border border-border bg-surface px-5 py-3 shadow-2xl">
      {/* Pulsing green dot */}
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

      {/* Mute toggle */}
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

      {/* Hang up */}
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
