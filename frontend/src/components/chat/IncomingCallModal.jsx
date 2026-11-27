import { useCall } from "../../hooks/useCall";
import { PhoneIcon, PhoneOffIcon, VideoIcon } from "../common/Icons";
import { Avatar } from "../common/Avatar";

export default function IncomingCallModal() {
  const { callState, callType, remoteUserName, acceptCall, rejectCall } = useCall();

  if (callState !== "incoming-ringing") return null;

  const isVideo = callType === "video";

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="mx-4 flex w-full max-w-sm flex-col items-center rounded-2xl border border-border bg-surface p-8 shadow-2xl">
        {/* Pulsing avatar ring */}
        <div className="relative mb-6">
          <div className="absolute inset-0 animate-ping rounded-full bg-brand/30" />
          <div className="relative">
            <Avatar user={{ name: remoteUserName || "Unknown" }} size="lg" showTooltip={false} />
          </div>
        </div>

        <h2 className="text-lg font-bold text-text-primary">
          {remoteUserName || "Someone"}
        </h2>
        <p className="mt-1 text-sm text-text-secondary animate-pulse">
          {isVideo ? "Incoming video call…" : "Incoming voice call…"}
        </p>

        {/* Action buttons */}
        <div className="mt-8 flex items-center gap-8">
          <button
            type="button"
            onClick={rejectCall}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white shadow-lg transition-transform hover:scale-110 active:scale-95 cursor-pointer"
            aria-label="Reject call"
          >
            <PhoneOffIcon className="h-6 w-6" />
          </button>

          <button
            type="button"
            onClick={acceptCall}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg transition-transform hover:scale-110 active:scale-95 animate-bounce cursor-pointer"
            aria-label="Accept call"
          >
            {isVideo ? (
              <VideoIcon className="h-6 w-6" />
            ) : (
              <PhoneIcon className="h-6 w-6" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
