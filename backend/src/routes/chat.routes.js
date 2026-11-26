const express = require("express");
const authMiddleware = require("../middleware/auth");
const {
  issueWebSocketTicket,
  getChatUsers,
  getUnreadSummary,
  getConversations,
  openDirectConversation,
  openProjectConversation,
  createGroupConversation,
  getMessages,
  sendMessage,
  markAsRead,
  editMessage,
  deleteMessage,
} = require("../controllers/chat.controller");

const router = express.Router();

// Lightweight per-user chat spam guard (120 messages / min)
const messageBurst = new Map();
const chatMessageRateLimit = (req, res, next) => {
  const uid = req.user?.userId || req.ip || "anon";
  const now = Date.now();
  if (messageBurst.size > 1000) {
    for (const [k, v] of messageBurst.entries()) {
      if (v.resetAt <= now) messageBurst.delete(k);
    }
  }
  const entry = messageBurst.get(uid);
  if (!entry || entry.resetAt <= now) {
    messageBurst.set(uid, { count: 1, resetAt: now + 60_000 });
    return next();
  }
  entry.count += 1;
  if (entry.count > 120) {
    return res.status(429).json({
      message: "You are sending messages too quickly. Please slow down.",
    });
  }
  return next();
};

router.use(authMiddleware);

router.post("/ws-ticket", issueWebSocketTicket);
router.get("/users", getChatUsers);
router.get("/unread", getUnreadSummary);

router.get("/conversations", getConversations);
router.post("/conversations/direct", openDirectConversation);
router.post("/conversations/project/:projectId", openProjectConversation);
router.post("/conversations/group", createGroupConversation);

router.get("/conversations/:conversationId/messages", getMessages);
router.post("/conversations/:conversationId/messages", chatMessageRateLimit, sendMessage);
router.post("/conversations/:conversationId/read", markAsRead);

router.patch("/messages/:messageId", editMessage);
router.delete("/messages/:messageId", deleteMessage);

module.exports = router;
