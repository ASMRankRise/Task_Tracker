const RECENT_STORAGE_KEY = "rankrise_chat_recent_stickers";
const MAX_RECENT_STICKERS = 12;
const API_BASE = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");

export const STICKER_PACKS = [
  {
    id: "work",
    name: "Work Vibes",
    stickers: [
      { id: "work/ship-it", label: "Ship It!", keywords: ["ship", "launch", "deploy", "rocket", "release"] },
      { id: "work/lgtm", label: "LGTM", keywords: ["lgtm", "approve", "good", "check", "ok", "pr"] },
      { id: "work/on-it", label: "On It!", keywords: ["on it", "working", "fast", "sprint", "bolt", "roger"] },
      { id: "work/coffee-break", label: "Coffee Break", keywords: ["coffee", "break", "chai", "tea", "mug", "tired"] },
      { id: "work/bug-squashed", label: "Bug Fixed!", keywords: ["bug", "fix", "fixed", "squashed", "debug", "solved"] },
      { id: "work/done", label: "Done!", keywords: ["done", "complete", "finished", "trophy", "win", "task"] },
      { id: "work/deadline", label: "Urgent!", keywords: ["deadline", "urgent", "rush", "alarm", "time", "asap"] },
      { id: "work/meeting", label: "Quick Sync?", keywords: ["meeting", "sync", "call", "standup", "huddle", "chat"] },
    ],
  },
  {
    id: "reactions",
    name: "Reactions",
    stickers: [
      { id: "reactions/thumbs-up", label: "Thumbs Up", keywords: ["thumbs", "yes", "ok", "like", "agree", "great"] },
      { id: "reactions/fire", label: "On Fire!", keywords: ["fire", "lit", "hot", "awesome", "amazing", "flame"] },
      { id: "reactions/party", label: "Woohoo!", keywords: ["party", "celebrate", "congrats", "woohoo", "yay", "confetti"] },
      { id: "reactions/love-it", label: "Love It!", keywords: ["love", "heart", "favorite", "awesome", "thanks"] },
      { id: "reactions/mind-blown", label: "Whoa!", keywords: ["mind", "blown", "whoa", "wow", "genius", "shock"] },
      { id: "reactions/clap", label: "Bravo!", keywords: ["clap", "bravo", "applause", "kudos", "well done", "props"] },
      { id: "reactions/thinking", label: "Hmm...", keywords: ["think", "hmm", "wonder", "question", "maybe", "idea"] },
      { id: "reactions/high-five", label: "Nice One!", keywords: ["high five", "nice", "team", "yes", "boom", "cheers", "100"] },
    ],
  },
  {
    id: "team",
    name: "Team Mood",
    stickers: [
      { id: "team/gm", label: "Good Morning!", keywords: ["gm", "morning", "hello", "hi", "sun", "wave"] },
      { id: "team/thanks", label: "Thank You!", keywords: ["thanks", "thank you", "ty", "appreciate", "grateful"] },
      { id: "team/my-bad", label: "My Bad!", keywords: ["sorry", "my bad", "oops", "apology", "mistake"] },
      { id: "team/brb", label: "BRB", keywords: ["brb", "right back", "wait", "pause", "minute"] },
      { id: "team/lets-go", label: "Let's Go!", keywords: ["lets go", "go", "hype", "excited", "start", "ready"] },
      { id: "team/all-good", label: "All Good", keywords: ["all good", "chill", "cool", "relaxed", "no worries", "np"] },
      { id: "team/help", label: "Need Help!", keywords: ["help", "sos", "stuck", "assist", "support", "please"] },
      { id: "team/afk", label: "AFK", keywords: ["afk", "away", "sleep", "offline", "bye", "gn", "later"] },
    ],
  },
];

export const ALL_STICKERS = STICKER_PACKS.flatMap((pack) =>
  pack.stickers.map((s) => ({
    ...s,
    packId: pack.id,
    packName: pack.name,
    url: `/stickers/${s.id}.webp`,
  })),
);

export const STICKER_MAP = new Map(ALL_STICKERS.map((s) => [s.id, s]));

export function isCustomStickerId(stickerId) {
  return typeof stickerId === "string" && stickerId.trim().startsWith("custom/");
}

export function getStickerMeta(stickerId, customStickers = []) {
  if (typeof stickerId !== "string") return null;
  const trimmed = stickerId.trim();
  const builtIn = STICKER_MAP.get(trimmed);
  if (builtIn) return builtIn;
  if (isCustomStickerId(trimmed) && Array.isArray(customStickers)) {
    const found = customStickers.find((s) => s.id === trimmed);
    if (found) {
      return {
        ...found,
        url: getStickerUrl(trimmed),
      };
    }
  }
  return null;
}

export function getStickerUrl(stickerId) {
  if (typeof stickerId !== "string") return null;
  const trimmed = stickerId.trim();
  const builtIn = STICKER_MAP.get(trimmed);
  if (builtIn) return builtIn.url;
  if (isCustomStickerId(trimmed)) {
    const rawId = trimmed.slice("custom/".length);
    if (!rawId) return null;
    return `${API_BASE}/chat/stickers/custom/${encodeURIComponent(rawId)}/image`;
  }
  return null;
}

export function getRecentStickerIds(customStickers = []) {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const customIdSet = new Set(
      Array.isArray(customStickers) ? customStickers.map((s) => s.id) : [],
    );
    return parsed
      .filter((id) => STICKER_MAP.has(id) || customIdSet.has(id))
      .slice(0, MAX_RECENT_STICKERS);
  } catch {
    return [];
  }
}

export function recordRecentSticker(stickerId) {
  if (typeof window === "undefined") return [];
  if (!STICKER_MAP.has(stickerId) && !isCustomStickerId(stickerId)) return [];
  let existing = [];
  try {
    const raw = window.localStorage.getItem(RECENT_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) existing = parsed;
  } catch {
    existing = [];
  }
  const next = [
    stickerId,
    ...existing.filter((id) => id !== stickerId),
  ].slice(0, MAX_RECENT_STICKERS);
  try {
    window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota errors
  }
  return next;
}
