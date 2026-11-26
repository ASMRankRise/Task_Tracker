const STICKER_PACKS = [
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
      { id: "reactions/high-five", label: "Nice One!", keywords: ["high five", "nice", "team", "yes", "boom", "cheers"] },
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

const STICKER_MAP = new Map();
for (const pack of STICKER_PACKS) {
  for (const sticker of pack.stickers) {
    STICKER_MAP.set(sticker.id, {
      ...sticker,
      packId: pack.id,
      packName: pack.name,
      url: `/stickers/${sticker.id}.webp`,
    });
  }
}

const isValidStickerId = (stickerId) =>
  typeof stickerId === "string" && STICKER_MAP.has(stickerId.trim());

const getStickerById = (stickerId) =>
  typeof stickerId === "string" ? STICKER_MAP.get(stickerId.trim()) || null : null;

module.exports = {
  STICKER_PACKS,
  STICKER_MAP,
  isValidStickerId,
  getStickerById,
};
