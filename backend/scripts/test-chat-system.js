const assert = require("assert");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const chatController = require("../src/controllers/chat.controller");
const ChatRepository = require("../src/repositories/ChatRepository");
const chatBroker = require("../src/realtime/chatBroker");
const Task = require("../src/models/Task");
const Project = require("../src/models/Project");

function createMockRes() {
  return {
    statusCode: 200,
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    },
  };
}

let total = 0;
let passed = 0;

async function test(name, fn) {
  total++;
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

async function runTests() {
  console.log("\n=======================================================");
  console.log("RUNNING INTERNAL CHAT & WEBSOCKET CONTROLLER TEST SUITE");
  console.log("=======================================================\n");

  const origJwtSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "test-chat-secret-12345";

  const userAId = new mongoose.Types.ObjectId().toString();
  const userBId = new mongoose.Types.ObjectId().toString();
  const userCId = new mongoose.Types.ObjectId().toString();
  const superAdminId = new mongoose.Types.ObjectId().toString();
  const convId = new mongoose.Types.ObjectId().toString();
  const projId = new mongoose.Types.ObjectId().toString();
  const taskId = new mongoose.Types.ObjectId().toString();
  const msgId = new mongoose.Types.ObjectId().toString();

  // Save originals
  const origRepo = { ...ChatRepository };
  const origBroadcast = chatBroker.broadcastToUsers;
  const origGetOnline = chatBroker.getOnlineUserIds;
  const origTaskFindById = Task.findById;
  const origProjFindById = Project.findById;

  let lastBroadcast = null;
  chatBroker.broadcastToUsers = async (recipientIds, event) => {
    lastBroadcast = { recipientIds, event };
    return { delivered: recipientIds.length };
  };
  chatBroker.getOnlineUserIds = async () => [userAId, userBId];

  await test("1. issueWebSocketTicket signs a valid short-lived WS ticket", async () => {
    ChatRepository.findUserById = async (id) => ({
      _id: id,
      name: "Alice Worker",
      role: "user",
    });

    const req = { user: { userId: userAId, role: "user" } };
    const res = createMockRes();
    await chatController.issueWebSocketTicket(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert(res.data?.ticket);
    const decoded = jwt.verify(res.data.ticket, process.env.JWT_SECRET);
    assert.strictEqual(decoded.userId, userAId);
    assert.strictEqual(decoded.name, "Alice Worker");
    assert.strictEqual(decoded.type, "ws");
  });

  await test("2. getChatUsers returns team list with live online IDs", async () => {
    ChatRepository.listUsersForChat = async () => [
      { _id: userAId, name: "Alice", role: "user" },
      { _id: userBId, name: "Bob", role: "admin" },
    ];

    const req = { user: { userId: userAId, role: "user" } };
    const res = createMockRes();
    await chatController.getChatUsers(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.users.length, 2);
    assert.deepStrictEqual(res.data.onlineIds, [userAId, userBId]);
  });

  await test("3. openDirectConversation blocks self-DM and opens valid DM with WS broadcast", async () => {
    const reqSelf = {
      user: { userId: userAId, role: "user" },
      body: { recipientId: userAId },
    };
    const resSelf = createMockRes();
    await chatController.openDirectConversation(reqSelf, resSelf);
    assert.strictEqual(resSelf.statusCode, 400);

    ChatRepository.findUserById = async (id) =>
      id === userBId ? { _id: userBId, name: "Bob", role: "user" } : null;
    ChatRepository.findOrCreateDirectConversation = async () => ({
      _id: convId,
      type: "direct",
      participants: [
        { _id: userAId, name: "Alice" },
        { _id: userBId, name: "Bob" },
      ],
    });

    lastBroadcast = null;
    const reqOk = {
      user: { userId: userAId, role: "user" },
      body: { recipientId: userBId },
    };
    const resOk = createMockRes();
    await chatController.openDirectConversation(reqOk, resOk);

    assert.strictEqual(resOk.statusCode, 200);
    assert.strictEqual(resOk.data.conversation._id, convId);
    assert.strictEqual(lastBroadcast.event.type, "chat:conversation_created");
    assert(lastBroadcast.recipientIds.includes(userBId));
  });

  await test("4. createGroupConversation validates group name & participants", async () => {
    ChatRepository.listUsersForChat = async () => [
      { _id: userAId, name: "Alice" },
      { _id: userBId, name: "Bob" },
      { _id: userCId, name: "Charlie" },
    ];
    ChatRepository.createGroupConversation = async (creatorId, name, others) => ({
      _id: convId,
      type: "group",
      name,
      participants: [creatorId, ...others].map((id) => ({ _id: id, name: "Member" })),
    });

    const reqBad = {
      user: { userId: userAId, role: "user" },
      body: { name: "X", participantIds: [userBId] },
    };
    const resBad = createMockRes();
    await chatController.createGroupConversation(reqBad, resBad);
    assert.strictEqual(resBad.statusCode, 400);

    lastBroadcast = null;
    const reqOk = {
      user: { userId: userAId, role: "user" },
      body: { name: "Design Sync", participantIds: [userBId, userCId] },
    };
    const resOk = createMockRes();
    await chatController.createGroupConversation(reqOk, resOk);
    assert.strictEqual(resOk.statusCode, 201);
    assert.strictEqual(resOk.data.conversation.name, "Design Sync");
    assert.strictEqual(lastBroadcast.recipientIds.length, 3);
  });

  await test("5. sendMessage enforces membership, validates task link, saves & broadcasts", async () => {
    ChatRepository.getConversationAccess = async (cid, uid) =>
      uid === userCId
        ? { forbidden: true }
        : {
            forbidden: false,
            conversation: { id: cid, type: "direct" },
            participantIds: [userAId, userBId],
          };

    // Unauthorized user gets 403
    const reqForbidden = {
      params: { conversationId: convId },
      user: { userId: userCId, role: "user" },
      body: { content: "Sneaking in" },
    };
    const resForbidden = createMockRes();
    await chatController.sendMessage(reqForbidden, resForbidden);
    assert.strictEqual(resForbidden.statusCode, 403);

    // Task outside user's project is rejected with 403
    Task.findById = async () => ({ _id: taskId, project: projId });
    Project.findById = async () => ({
      _id: projId,
      owner: { toString: () => userCId },
      projectHead: null,
      members: [{ toString: () => userCId }],
    });

    const reqBadTask = {
      params: { conversationId: convId },
      user: { userId: userAId, role: "user" },
      body: { content: "Check this task", taskId },
    };
    const resBadTask = createMockRes();
    await chatController.sendMessage(reqBadTask, resBadTask);
    assert.strictEqual(resBadTask.statusCode, 403);

    // Authorized member + valid project task succeeds and broadcasts via WebSocket broker
    Project.findById = async () => ({
      _id: projId,
      owner: { toString: () => userBId },
      projectHead: null,
      members: [{ toString: () => userAId }, { toString: () => userBId }],
    });
    ChatRepository.createMessage = async ({ conversationId, senderId, content, taskId: tid }) => ({
      _id: msgId,
      conversationId,
      sender: { _id: senderId, name: "Alice" },
      content,
      task: tid ? { _id: tid, title: "Fix auth redirect", status: "in-progress" } : null,
      createdAt: new Date(),
    });

    lastBroadcast = null;
    const reqOk = {
      params: { conversationId: convId },
      user: { userId: userAId, role: "user" },
      body: { content: "Please review this", taskId },
    };
    const resOk = createMockRes();
    await chatController.sendMessage(reqOk, resOk);

    assert.strictEqual(resOk.statusCode, 201);
    assert.strictEqual(resOk.data.message._id, msgId);
    assert.strictEqual(resOk.data.message.task._id, taskId);
    assert.strictEqual(lastBroadcast.event.type, "chat:message");
    assert.deepStrictEqual(lastBroadcast.recipientIds, [userAId, userBId]);
  });

  await test("6. editMessage & deleteMessage enforce authorship (or superadmin delete) and broadcast", async () => {
    ChatRepository.findMessageById = async () => ({
      id: msgId,
      conversation_id: convId,
      sender_id: userAId,
      content: "Original text",
      deleted_at: null,
    });
    ChatRepository.getConversationAccess = async () => ({
      forbidden: false,
      participantIds: [userAId, userBId],
    });
    ChatRepository.editMessage = async (id, content) => ({
      _id: id,
      conversationId: convId,
      content,
      editedAt: new Date(),
    });
    ChatRepository.softDeleteMessage = async (id) => ({
      _id: id,
      conversationId: convId,
      content: "",
      deleted: true,
    });

    // User B cannot edit User A's message
    const reqOtherEdit = {
      params: { messageId: msgId },
      user: { userId: userBId, role: "user" },
      body: { content: "Tampered" },
    };
    const resOtherEdit = createMockRes();
    await chatController.editMessage(reqOtherEdit, resOtherEdit);
    assert.strictEqual(resOtherEdit.statusCode, 403);

    // User A can edit own message -> broadcasts chat:message_updated
    lastBroadcast = null;
    const reqOwnEdit = {
      params: { messageId: msgId },
      user: { userId: userAId, role: "user" },
      body: { content: "Updated text" },
    };
    const resOwnEdit = createMockRes();
    await chatController.editMessage(reqOwnEdit, resOwnEdit);
    assert.strictEqual(resOwnEdit.statusCode, 200);
    assert.strictEqual(lastBroadcast.event.type, "chat:message_updated");

    // User B cannot delete User A's message
    const reqOtherDelete = {
      params: { messageId: msgId },
      user: { userId: userBId, role: "user" },
    };
    const resOtherDelete = createMockRes();
    await chatController.deleteMessage(reqOtherDelete, resOtherDelete);
    assert.strictEqual(resOtherDelete.statusCode, 403);

    // SuperAdmin can delete any message -> broadcasts chat:message_deleted
    lastBroadcast = null;
    const reqSuperDelete = {
      params: { messageId: msgId },
      user: { userId: superAdminId, role: "superadmin" },
    };
    const resSuperDelete = createMockRes();
    await chatController.deleteMessage(reqSuperDelete, resSuperDelete);
    assert.strictEqual(resSuperDelete.statusCode, 200);
    assert.strictEqual(resSuperDelete.data.message.deleted, true);
    assert.strictEqual(lastBroadcast.event.type, "chat:message_deleted");
  });

  await test("7. sendMessage validates stickers, supports replies, and editMessage rejects stickers", async () => {
    ChatRepository.getConversationAccess = async (cid) => ({
      forbidden: false,
      conversation: { id: cid, type: "direct" },
      participantIds: [userAId, userBId],
    });
    ChatRepository.findMessageById = async (id) => ({
      id,
      conversation_id: convId,
      sender_id: userAId,
      content: "Original message",
      message_type: "text",
      sticker_id: null,
      deleted_at: null,
    });

    // Unknown messageType returns 400
    const reqBadType = {
      params: { conversationId: convId },
      user: { userId: userAId, role: "user" },
      body: { messageType: "gif", content: "nope" },
    };
    const resBadType = createMockRes();
    await chatController.sendMessage(reqBadType, resBadType);
    assert.strictEqual(resBadType.statusCode, 400);

    // Unknown stickerId returns 400
    const reqBadSticker = {
      params: { conversationId: convId },
      user: { userId: userAId, role: "user" },
      body: { messageType: "sticker", stickerId: "work/not-a-real-sticker" },
    };
    const resBadSticker = createMockRes();
    await chatController.sendMessage(reqBadSticker, resBadSticker);
    assert.strictEqual(resBadSticker.statusCode, 400);

    // Valid sticker succeeds with empty content and broadcasts chat:message
    let capturedCreateArgs = null;
    ChatRepository.createMessage = async (args) => {
      capturedCreateArgs = args;
      return {
        _id: msgId,
        conversationId: args.conversationId,
        sender: { _id: args.senderId, name: "Alice" },
        content: args.content,
        messageType: args.messageType,
        stickerId: args.stickerId,
        replyTo: args.replyToId ? { _id: args.replyToId, content: "Original message" } : null,
        createdAt: new Date(),
      };
    };

    lastBroadcast = null;
    const reqStickerOk = {
      params: { conversationId: convId },
      user: { userId: userAId, role: "user" },
      body: {
        messageType: "sticker",
        stickerId: "work/ship-it",
        replyToId: msgId,
      },
    };
    const resStickerOk = createMockRes();
    await chatController.sendMessage(reqStickerOk, resStickerOk);
    assert.strictEqual(resStickerOk.statusCode, 201);
    assert.strictEqual(capturedCreateArgs.messageType, "sticker");
    assert.strictEqual(capturedCreateArgs.stickerId, "work/ship-it");
    assert.strictEqual(capturedCreateArgs.content, "");
    assert.strictEqual(resStickerOk.data.message.messageType, "sticker");
    assert.strictEqual(resStickerOk.data.message.stickerId, "work/ship-it");
    assert.strictEqual(lastBroadcast.event.type, "chat:message");

    // Editing a sticker message is rejected with 400
    ChatRepository.findMessageById = async () => ({
      id: msgId,
      conversation_id: convId,
      sender_id: userAId,
      content: "",
      message_type: "sticker",
      sticker_id: "work/ship-it",
      deleted_at: null,
    });

    const reqEditSticker = {
      params: { messageId: msgId },
      user: { userId: userAId, role: "user" },
      body: { content: "Try editing sticker" },
    };
    const resEditSticker = createMockRes();
    await chatController.editMessage(reqEditSticker, resEditSticker);
    assert.strictEqual(resEditSticker.statusCode, 400);
  });

  await test("8. custom stickers support upload validation, sending, and uploader/superadmin delete", async () => {
    const customId = new mongoose.Types.ObjectId().toString();
    // Minimal valid 1x1 transparent PNG
    const validPngB64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const validDataUrl = `data:image/png;base64,${validPngB64}`;

    // Reject spoofed/non-image content
    const reqBadMagic = {
      user: { userId: userAId, role: "user" },
      body: {
        label: "Fake",
        dataUrl: `data:image/png;base64,${Buffer.from("<script>alert(1)</script>").toString("base64")}`,
      },
    };
    const resBadMagic = createMockRes();
    await chatController.uploadCustomSticker(reqBadMagic, resBadMagic);
    assert.strictEqual(resBadMagic.statusCode, 400);

    // Valid upload succeeds and broadcasts chat:custom_sticker_added
    ChatRepository.countCustomStickers = async () => 2;
    ChatRepository.createCustomSticker = async ({ label, mimeType, sizeBytes, uploadedBy }) => ({
      _id: customId,
      id: `custom/${customId}`,
      label,
      mimeType,
      sizeBytes,
      packId: "custom",
      packName: "Custom",
      url: `/api/chat/stickers/custom/${customId}/image`,
      uploadedBy: { _id: uploadedBy, name: "Alice" },
      createdAt: new Date(),
    });

    lastBroadcast = null;
    const reqUploadOk = {
      user: { userId: userAId, role: "user" },
      body: { label: "Team Logo", dataUrl: validDataUrl },
    };
    const resUploadOk = createMockRes();
    await chatController.uploadCustomSticker(reqUploadOk, resUploadOk);
    assert.strictEqual(resUploadOk.statusCode, 201);
    assert.strictEqual(resUploadOk.data.sticker.id, `custom/${customId}`);
    assert.strictEqual(lastBroadcast.event.type, "chat:custom_sticker_added");

    // Sending a custom sticker checks customStickerExists
    ChatRepository.getConversationAccess = async (cid) => ({
      forbidden: false,
      conversation: { id: cid, type: "direct" },
      participantIds: [userAId, userBId],
    });
    ChatRepository.customStickerExists = async (id) => id === customId;
    ChatRepository.createMessage = async (args) => ({
      _id: msgId,
      conversationId: args.conversationId,
      sender: { _id: args.senderId, name: "Alice" },
      content: "",
      messageType: args.messageType,
      stickerId: args.stickerId,
      createdAt: new Date(),
    });

    const reqSendCustom = {
      params: { conversationId: convId },
      user: { userId: userAId, role: "user" },
      body: { messageType: "sticker", stickerId: `custom/${customId}` },
    };
    const resSendCustom = createMockRes();
    await chatController.sendMessage(reqSendCustom, resSendCustom);
    assert.strictEqual(resSendCustom.statusCode, 201);
    assert.strictEqual(resSendCustom.data.message.stickerId, `custom/${customId}`);

    // Another regular user cannot delete Alice's custom sticker
    ChatRepository.findCustomStickerById = async () => ({
      id: customId,
      uploaded_by: userAId,
      mime_type: "image/png",
      image_data: validPngB64,
    });
    ChatRepository.deleteCustomSticker = async () => true;

    const reqOtherDel = {
      params: { stickerId: customId },
      user: { userId: userBId, role: "user" },
    };
    const resOtherDel = createMockRes();
    await chatController.deleteCustomSticker(reqOtherDel, resOtherDel);
    assert.strictEqual(resOtherDel.statusCode, 403);

    // SuperAdmin can delete any custom sticker
    lastBroadcast = null;
    const reqSuperDel = {
      params: { stickerId: customId },
      user: { userId: superAdminId, role: "superadmin" },
    };
    const resSuperDel = createMockRes();
    await chatController.deleteCustomSticker(reqSuperDel, resSuperDel);
    assert.strictEqual(resSuperDel.statusCode, 200);
    assert.strictEqual(lastBroadcast.event.type, "chat:custom_sticker_deleted");
  });

  await test("11. getIceServers returns free Google STUN servers", async () => {
    const req = { user: { userId: userAId, role: "user" } };
    const res = createMockRes();
    await chatController.getIceServers(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert(Array.isArray(res.data?.iceServers));
    assert(res.data.iceServers.some((s) => String(s.urls).startsWith("stun:")));
  });

  // Restore originals
  Object.assign(ChatRepository, origRepo);
  chatBroker.broadcastToUsers = origBroadcast;
  chatBroker.getOnlineUserIds = origGetOnline;
  Task.findById = origTaskFindById;
  Project.findById = origProjFindById;
  if (origJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = origJwtSecret;

  console.log(`\n=======================================================`);
  console.log(`CHAT SUITE SUMMARY: ${passed}/${total} TESTS PASSED`);
  console.log(`=======================================================\n`);
  if (passed !== total) process.exit(1);
}

runTests();
