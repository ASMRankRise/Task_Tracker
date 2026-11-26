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
