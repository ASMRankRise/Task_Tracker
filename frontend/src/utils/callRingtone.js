/**
 * Synthesizes clean incoming ringtone and outgoing ringback tones
 * using the browser's Web Audio API (no external audio files needed).
 */

let sharedCtx = null;
let activeTimer = null;
let activeNodes = [];

function getAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedCtx || sharedCtx.state === "closed") {
    sharedCtx = new AudioCtx();
  }
  return sharedCtx;
}

/**
 * Unlocks/resumes the shared AudioContext on user gesture so incoming
 * WebSocket call events can ring immediately even without a fresh click.
 */
export function unlockCallAudio() {
  const ctx = getAudioContext();
  if (ctx && ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
}

function playTone(ctx, freq, startOffset, duration, volume = 0.14, type = "sine") {
  const now = ctx.currentTime + startOffset;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + duration + 0.02);

  activeNodes.push(osc);
  osc.onended = () => {
    activeNodes = activeNodes.filter((n) => n !== osc);
  };
}

export function stopCallTones() {
  if (activeTimer) {
    clearInterval(activeTimer);
    activeTimer = null;
  }
  for (const osc of activeNodes) {
    try {
      osc.stop();
      osc.disconnect();
    } catch {
      // Already stopped
    }
  }
  activeNodes = [];
}

/**
 * Plays a pleasant two-phrase chime pattern every 2.2s for incoming calls.
 */
export function startIncomingRingtone() {
  stopCallTones();
  const ctx = getAudioContext();
  if (!ctx) return;

  const playPattern = () => {
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    // Warm harmonic arpeggio chime: E5 -> G#5 -> B5, then E5 -> B5
    playTone(ctx, 659.25, 0.0, 0.24, 0.14, "triangle");
    playTone(ctx, 830.61, 0.14, 0.24, 0.14, "triangle");
    playTone(ctx, 987.77, 0.28, 0.38, 0.16, "triangle");

    playTone(ctx, 659.25, 0.72, 0.22, 0.12, "triangle");
    playTone(ctx, 987.77, 0.88, 0.42, 0.15, "triangle");
  };

  playPattern();
  activeTimer = setInterval(playPattern, 2200);
}

/**
 * Plays a soft subtle ringback tone every 3s while outgoing call is ringing.
 */
export function startOutgoingRingback() {
  stopCallTones();
  const ctx = getAudioContext();
  if (!ctx) return;

  const playPulse = () => {
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    playTone(ctx, 440, 0.0, 0.7, 0.035, "sine");
    playTone(ctx, 480, 0.0, 0.7, 0.035, "sine");
  };

  playPulse();
  activeTimer = setInterval(playPulse, 3000);
}
