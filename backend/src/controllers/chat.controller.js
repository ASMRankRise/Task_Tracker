const jwt = require("jsonwebtoken");
const { isValidId } = require("../db/d1");
const Task = require("../models/Task");
const Project = require("../models/Project");
const ChatRepository = require("../repositories/ChatRepository");
const chatBroker = require("../realtime/chatBroker");

const MAX_MESSAGE_LENGTH = 4000;

const handleAccessCheck = async (conversationId, user, res) => {
  if (!isValidId(conversationId)) {
    res.status(400).json({ message: "Invalid conversation ID" });
    return null;
  }

  const access = await ChatRepository.getConversationAccess(
    conversationId,
    user.userId,
    user.role,
  );

  if (!access) {
    res.status(404).json({ message: "Conversation not found" });
    return null;
  }

  if (access.forbidden) {
    res.status(403).json({ message: "You do not have access to this conversation" });
    return null;
  }

  return access;
};

// POST /api/chat/ws-ticket
const issueWebSocketTicket = async (req, res) => {
  try {
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: "Server configuration error" });
    }

    const user = await ChatRepository.findUserById(req.user.userId);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    const ticket = jwt.sign(
      {
        userId: user._id,
        name: user.name,
        type: "ws",
      },
      process.env.JWT_SECRET,
      { expiresIn: "60s" },
    );

    return res.status(200).json({ ticket });
  } catch (error) {
    console.error("[Chat] WS ticket error:", error.message || error);
    return res.status(500).json({ message: "Failed to issue WebSocket ticket" });
  }
};

// GET /api/chat/users
const getChatUsers = async (req, res) => {
  try {
    const [users, onlineIds] = await Promise.all([
      ChatRepository.listUsersForChat(),
      chatBroker.getOnlineUserIds(),
    ]);
    return res.status(200).json({ users, onlineIds });
  } catch (error) {
    console.error("[Chat] Get users error:", error.message || error);
    return res.status(500).json({ message: "Failed to load team members" });
  }
};

// GET /api/chat/unread
const getUnreadSummary = async (req, res) => {
  try {
    const summary = await ChatRepository.getUnreadSummary(
      req.user.userId,
      req.user.role,
    );
    return res.status(200).json(summary);
  } catch (error) {
    console.error("[Chat] Unread summary error:", error.message || error);
    return res.status(500).json({ message: "Failed to load unread summary" });
  }
};

// GET /api/chat/conversations
const getConversations = async (req, res) => {
  try {
    const [conversations, onlineIds] = await Promise.all([
      ChatRepository.listConversationsForUser(req.user.userId, req.user.role),
      chatBroker.getOnlineUserIds(),
    ]);
    return res.status(200).json({ conversations, onlineIds });
  } catch (error) {
    console.error("[Chat] Get conversations error:", error.message || error);
    return res.status(500).json({ message: "Failed to load conversations" });
  }
};

// POST /api/chat/conversations/direct
const openDirectConversation = async (req, res) => {
  try {
    const { recipientId } = req.body || {};

    if (!isValidId(recipientId)) {
      return res.status(400).json({ message: "Valid recipient ID is required" });
    }

    if (String(recipientId) === String(req.user.userId)) {
      return res.status(400).json({ message: "Cannot create a direct chat with yourself" });
    }

    const recipient = await ChatRepository.findUserById(recipientId);
    if (!recipient) {
      return res.status(404).json({ message: "Recipient user not found" });
    }

    const conversation = await ChatRepository.findOrCreateDirectConversation(
      req.user.userId,
      recipientId,
    );

    await chatBroker.broadcastToUsers([req.user.userId, recipientId], {
      type: "chat:conversation_created",
      conversation,
    });

    return res.status(200).json({ conversation });
  } catch (error) {
    console.error("[Chat] Open direct conversation error:", error.message || error);
    return res.status(500).json({ message: "Failed to open direct conversation" });
  }
};

// POST /api/chat/conversations/project/:projectId
const openProjectConversation = async (req, res) => {
  try {
    const { projectId } = req.params;
    if (!isValidId(projectId)) {
      return res.status(400).json({ message: "Valid project ID is required" });
    }

    const conversation = await ChatRepository.findOrCreateProjectConversation(
      projectId,
      req.user.userId,
      req.user.role,
    );

    if (!conversation) {
      return res.status(403).json({
        message: "Project not found or you do not have access",
      });
    }

    return res.status(200).json({ conversation });
  } catch (error) {
    console.error("[Chat] Open project conversation error:", error.message || error);
    return res.status(500).json({ message: "Failed to open project chat" });
  }
};

// POST /api/chat/conversations/group
const createGroupConversation = async (req, res) => {
  try {
    const { name, participantIds = [] } = req.body || {};

    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ message: "Group name is required" });
    }

    const trimmedName = name.trim();
    if (trimmedName.length < 2 || trimmedName.length > 80) {
      return res.status(400).json({
        message: "Group name must be between 2 and 80 characters",
      });
    }

    if (!Array.isArray(participantIds)) {
      return res.status(400).json({ message: "participantIds must be an array" });
    }

    const validIds = [...new Set(participantIds.filter(isValidId).map(String))];
    const others = validIds.filter((id) => id !== String(req.user.userId));
    if (others.length === 0) {
      return res.status(400).json({
        message: "Select at least one team member to create a group",
      });
    }

    const allUsers = await ChatRepository.listUsersForChat();
    const userSet = new Set(allUsers.map((u) => u._id));
    const invalidId = others.find((id) => !userSet.has(id));
    if (invalidId) {
      return res.status(404).json({ message: "One or more selected members were not found" });
    }

    const conversation = await ChatRepository.createGroupConversation(
      req.user.userId,
      trimmedName,
      others,
    );

    const recipients = conversation.participants.map((p) => p._id);
    await chatBroker.broadcastToUsers(recipients, {
      type: "chat:conversation_created",
      conversation,
    });

    return res.status(201).json({ conversation });
  } catch (error) {
    console.error("[Chat] Create group error:", error.message || error);
    return res.status(500).json({ message: "Failed to create group conversation" });
  }
};

// GET /api/chat/conversations/:conversationId/messages
const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const access = await handleAccessCheck(conversationId, req.user, res);
    if (!access) return;

    const { before, after, limit = 50 } = req.query;

    if (before && Number.isNaN(new Date(before).getTime())) {
      return res.status(400).json({ message: "Invalid before cursor" });
    }

    if (after && Number.isNaN(new Date(after).getTime())) {
      return res.status(400).json({ message: "Invalid after cursor" });
    }

    const data = await ChatRepository.listMessages(conversationId, {
      before,
      after,
      limit,
    });

    return res.status(200).json(data);
  } catch (error) {
    console.error("[Chat] Get messages error:", error.message || error);
    return res.status(500).json({ message: "Failed to fetch messages" });
  }
};

// POST /api/chat/conversations/:conversationId/messages
const sendMessage = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const access = await handleAccessCheck(conversationId, req.user, res);
    if (!access) return;

    const { content, taskId, replyToId } = req.body || {};

    if (typeof content !== "string" || !content.trim()) {
      return res.status(400).json({ message: "Message cannot be empty" });
    }

    const trimmed = content.trim();
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({
        message: `Message cannot exceed ${MAX_MESSAGE_LENGTH} characters`,
      });
    }

    let validatedTaskId = null;
    if (taskId) {
      if (!isValidId(taskId)) {
        return res.status(400).json({ message: "Invalid task ID" });
      }
      const task = await Task.findById(taskId);
      if (!task) {
        return res.status(404).json({ message: "Referenced task not found" });
      }
      if (req.user.role !== "superadmin") {
        const proj = await Project.findById(task.project);
        const uid = String(req.user.userId);
        const inProj =
          proj &&
          (proj.owner?.toString() === uid ||
            proj.projectHead?.toString() === uid ||
            (proj.members || []).some((m) => m.toString() === uid));
        if (!inProj) {
          return res.status(403).json({
            message: "You can only link tasks from projects you belong to",
          });
        }
      }
      validatedTaskId = task._id;
    }

    let validatedReplyId = null;
    if (replyToId) {
      if (!isValidId(replyToId)) {
        return res.status(400).json({ message: "Invalid reply message ID" });
      }
      const parentMsg = await ChatRepository.findMessageById(replyToId);
      if (!parentMsg || String(parentMsg.conversation_id) !== String(conversationId)) {
        return res.status(400).json({ message: "Reply target not found in this conversation" });
      }
      validatedReplyId = parentMsg.id;
    }

    const message = await ChatRepository.createMessage({
      conversationId,
      senderId: req.user.userId,
      content: trimmed,
      taskId: validatedTaskId,
      replyToId: validatedReplyId,
    });

    await chatBroker.broadcastToUsers(access.participantIds, {
      type: "chat:message",
      conversationId: String(conversationId),
      message,
    });

    return res.status(201).json({ message });
  } catch (error) {
    console.error("[Chat] Send message error:", error.message || error);
    return res.status(500).json({ message: "Failed to send message" });
  }
};

// POST /api/chat/conversations/:conversationId/read
const markAsRead = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const access = await handleAccessCheck(conversationId, req.user, res);
    if (!access) return;

    const lastReadAt = await ChatRepository.markConversationRead(
      conversationId,
      req.user.userId,
    );

    await chatBroker.broadcastToUsers(access.participantIds, {
      type: "chat:read",
      conversationId: String(conversationId),
      userId: String(req.user.userId),
      lastReadAt,
    });

    return res.status(200).json({ lastReadAt });
  } catch (error) {
    console.error("[Chat] Mark read error:", error.message || error);
    return res.status(500).json({ message: "Failed to mark conversation as read" });
  }
};

// PATCH /api/chat/messages/:messageId
const editMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    if (!isValidId(messageId)) {
      return res.status(400).json({ message: "Invalid message ID" });
    }

    const existing = await ChatRepository.findMessageById(messageId);
    if (!existing) {
      return res.status(404).json({ message: "Message not found" });
    }

    if (String(existing.sender_id) !== String(req.user.userId)) {
      return res.status(403).json({ message: "You can only edit your own messages" });
    }

    if (existing.deleted_at) {
      return res.status(400).json({ message: "Deleted messages cannot be edited" });
    }

    const { content } = req.body || {};
    if (typeof content !== "string" || !content.trim()) {
      return res.status(400).json({ message: "Message cannot be empty" });
    }

    const trimmed = content.trim();
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({
        message: `Message cannot exceed ${MAX_MESSAGE_LENGTH} characters`,
      });
    }

    const access = await ChatRepository.getConversationAccess(
      existing.conversation_id,
      req.user.userId,
      req.user.role,
    );

    const updated = await ChatRepository.editMessage(messageId, trimmed);

    if (access && !access.forbidden) {
      await chatBroker.broadcastToUsers(access.participantIds, {
        type: "chat:message_updated",
        conversationId: String(existing.conversation_id),
        message: updated,
      });
    }

    return res.status(200).json({ message: updated });
  } catch (error) {
    console.error("[Chat] Edit message error:", error.message || error);
    return res.status(500).json({ message: "Failed to edit message" });
  }
};

// DELETE /api/chat/messages/:messageId
const deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    if (!isValidId(messageId)) {
      return res.status(400).json({ message: "Invalid message ID" });
    }

    const existing = await ChatRepository.findMessageById(messageId);
    if (!existing) {
      return res.status(404).json({ message: "Message not found" });
    }

    const isSender = String(existing.sender_id) === String(req.user.userId);
    const isSuperAdmin = req.user.role === "superadmin";
    if (!isSender && !isSuperAdmin) {
      return res.status(403).json({ message: "You can only delete your own messages" });
    }

    const access = await ChatRepository.getConversationAccess(
      existing.conversation_id,
      req.user.userId,
      req.user.role,
    );

    const updated = await ChatRepository.softDeleteMessage(messageId);

    if (access && !access.forbidden) {
      await chatBroker.broadcastToUsers(access.participantIds, {
        type: "chat:message_deleted",
        conversationId: String(existing.conversation_id),
        message: updated,
      });
    }

    return res.status(200).json({ message: updated });
  } catch (error) {
    console.error("[Chat] Delete message error:", error.message || error);
    return res.status(500).json({ message: "Failed to delete message" });
  }
};

module.exports = {
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
};
