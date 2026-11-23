const assert = require("assert");
const mongoose = require("mongoose");

// Controllers
const {
  createTask,
  getTasks,
  getTaskById,
  getTaskHistory,
  updateTask,
  deleteTask,
  createComment,
  getComments,
} = require("../src/controllers/task.controller");

// Models & Utils
const Task = require("../src/models/Task");
const Project = require("../src/models/Project");
const User = require("../src/models/User");
const Comment = require("../src/models/Comment");
const TaskActivity = require("../src/models/TaskActivity");
const cacheUtils = require("../src/utils/cache");

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function createMockRes() {
  const res = {
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
  return res;
}

async function test(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

async function runTests() {
  console.log("\n=======================================================");
  console.log("TASK MANAGEMENT BACKEND TARGETED ISSUES VERIFICATION");
  console.log("=======================================================\n");

  // Fixtures
  const superAdminId = new mongoose.Types.ObjectId().toString();
  const ownerId = new mongoose.Types.ObjectId().toString();
  const projectHeadId = new mongoose.Types.ObjectId().toString();
  const assignedMemberId = new mongoose.Types.ObjectId().toString();
  const unassignedMemberId = new mongoose.Types.ObjectId().toString();
  const outsiderId = new mongoose.Types.ObjectId().toString();

  const projectIdA = new mongoose.Types.ObjectId().toString();
  const taskIdA = new mongoose.Types.ObjectId().toString();

  // Mock TaskActivity methods for in-memory testing
  const activityLogs = [];
  TaskActivity.create = async (doc) => {
    activityLogs.push(doc);
    return doc;
  };
  TaskActivity.insertMany = async (docs) => {
    activityLogs.push(...docs);
    return docs;
  };
  let deletedActivityFilter = null;
  TaskActivity.deleteMany = async (filter) => {
    deletedActivityFilter = filter;
    return { deletedCount: 1 };
  };

  let deletedCommentFilter = null;
  Comment.deleteMany = async (filter) => {
    deletedCommentFilter = filter;
    return { deletedCount: 1 };
  };

  const mockProjectA = {
    _id: projectIdA,
    name: "Project Alpha",
    owner: { toString: () => ownerId },
    projectHead: { toString: () => projectHeadId },
    members: [
      { toString: () => ownerId },
      { toString: () => projectHeadId },
      { toString: () => assignedMemberId },
      { toString: () => unassignedMemberId },
    ],
  };

  Project.findById = async (id) => {
    if (String(id) === String(projectIdA)) return mockProjectA;
    return null;
  };

  function createMockTask(tId, pId, priority = "medium", status = "todo", assigned = [assignedMemberId]) {
    return {
      _id: tId,
      project: pId,
      title: "Sample Task",
      description: "Sample Description",
      priority,
      status,
      assignedTo: assigned.map((id) => ({
        _id: id,
        name: `User ${id}`,
        email: `user_${id}@test.com`,
        toString: () => id,
      })),
      dueDate: new Date("2026-12-01T00:00:00.000Z"),
      scheduledStartAt: null,
      startedAt: null,
      completedAt: null,
      timeSpentSeconds: 0,
      submittedBy: null,
      submittedAt: null,
      doneAt: null,
      save: async function () { return this; },
      populate: async function () { return this; },
      deleteOne: async function () { return true; },
    };
  }

  // 1. Updating priority without changing status
  await test("1. Updating priority without changing status succeeds (200)", async () => {
    const task = createMockTask(taskIdA, projectIdA, "low", "todo");
    Task.findById = async () => task;

    const req = {
      params: { taskId: taskIdA },
      user: { userId: ownerId, role: "admin" },
      body: { priority: "high" },
    };
    const res = createMockRes();
    await updateTask(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(task.priority, "high");
    assert.strictEqual(task.status, "todo");
  });

  // 2. Updating due date without changing status
  await test("2. Updating due date without changing status succeeds (200)", async () => {
    const task = createMockTask(taskIdA, projectIdA, "medium", "in-progress");
    Task.findById = async () => task;

    const newDate = "2026-12-25T00:00:00.000Z";
    const req = {
      params: { taskId: taskIdA },
      user: { userId: ownerId, role: "admin" },
      body: { dueDate: newDate },
    };
    const res = createMockRes();
    await updateTask(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(new Date(task.dueDate).toISOString(), newDate);
    assert.strictEqual(task.status, "in-progress");
  });

  // 3. Sending the same status again alongside priority / other fields
  await test("3. Sending the same status again does NOT reject request (200)", async () => {
    const task = createMockTask(taskIdA, projectIdA, "low", "todo");
    Task.findById = async () => task;

    const req = {
      params: { taskId: taskIdA },
      user: { userId: projectHeadId, role: "user" },
      body: { status: "todo", priority: "high" },
    };
    const res = createMockRes();
    await updateTask(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(task.status, "todo");
    assert.strictEqual(task.priority, "high");
  });

  // 4. Valid forward status transitions: todo -> in-progress -> testing -> completed -> done
  await test("4. Valid forward status transitions: todo -> in-progress -> testing -> completed -> done", async () => {
    const task = createMockTask(taskIdA, projectIdA, "low", "todo");
    Task.findById = async () => task;

    // Step 1: todo -> in-progress
    let req = {
      params: { taskId: taskIdA },
      user: { userId: assignedMemberId, role: "user" },
      body: { status: "in-progress" },
    };
    let res = createMockRes();
    await updateTask(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(task.status, "in-progress");
    assert(task.startedAt instanceof Date);

    // Step 2: in-progress -> testing
    req = {
      params: { taskId: taskIdA },
      user: { userId: assignedMemberId, role: "user" },
      body: { status: "testing" },
    };
    res = createMockRes();
    await updateTask(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(task.status, "testing");

    // Step 3: testing -> completed
    req = {
      params: { taskId: taskIdA },
      user: { userId: assignedMemberId, role: "user" },
      body: { status: "completed" },
    };
    res = createMockRes();
    await updateTask(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(task.status, "completed");
    assert(task.completedAt instanceof Date);
    assert.strictEqual(task.submittedBy, assignedMemberId);
    assert(task.timeSpentSeconds >= 0);

    // Step 4: completed -> done
    req = {
      params: { taskId: taskIdA },
      user: { userId: ownerId, role: "admin" },
      body: { status: "done" },
    };
    res = createMockRes();
    await updateTask(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(task.status, "done");
    assert(task.doneAt instanceof Date);
  });

  // 5. Rejected backward status transitions & skip transitions
  await test("5. Rejected backward status transitions return 400", async () => {
    const task = createMockTask(taskIdA, projectIdA, "low", "testing");
    Task.findById = async () => task;

    // Backward transition: testing -> in-progress -> 400
    const reqBack = {
      params: { taskId: taskIdA },
      user: { userId: ownerId, role: "admin" },
      body: { status: "in-progress" },
    };
    const resBack = createMockRes();
    await updateTask(reqBack, resBack);
    assert.strictEqual(resBack.statusCode, 400);
    assert(resBack.data.message.includes("Task must follow the correct status sequence"));

    // Skip forward transition: testing -> done (skipping completed) -> 400
    const reqSkip = {
      params: { taskId: taskIdA },
      user: { userId: superAdminId, role: "superadmin" },
      body: { status: "done" },
    };
    const resSkip = createMockRes();
    await updateTask(reqSkip, resSkip);
    assert.strictEqual(resSkip.statusCode, 400);
    assert(resSkip.data.message.includes("Task must follow the correct status sequence"));
  });

  // 6. Updating a non-existent task returns 404, not 500
  await test("6. Updating a non-existent task returns 404 without crashing (no 500)", async () => {
    Task.findById = async () => null;

    const nonExistentId = new mongoose.Types.ObjectId().toString();
    const req = {
      params: { taskId: nonExistentId },
      user: { userId: superAdminId, role: "superadmin" },
      body: { status: "in-progress" },
    };
    const res = createMockRes();
    await updateTask(req, res);

    assert.strictEqual(res.statusCode, 404);
    assert.strictEqual(res.data.message, "Task not found");
  });

  // 7. Task history works for assigned users and authorized managers
  await test("7. Task history works for assigned users and authorized managers, blocks unassigned (403)", async () => {
    const sampleTask = {
      _id: taskIdA,
      project: mockProjectA,
      assignedTo: [{ _id: assignedMemberId, email: "assigned@test.com" }],
    };
    Task.findById = () => ({
      populate: async () => sampleTask,
    });
    TaskActivity.find = () => ({
      populate: () => ({
        sort: async () => [{ action: "created", field: "task" }],
      }),
    });

    // 7a. Super Admin -> 200
    let req = { params: { taskId: taskIdA }, user: { userId: superAdminId, role: "superadmin" } };
    let res = createMockRes();
    await getTaskHistory(req, res);
    assert.strictEqual(res.statusCode, 200);

    // 7b. Project Owner -> 200
    req = { params: { taskId: taskIdA }, user: { userId: ownerId, role: "admin" } };
    res = createMockRes();
    await getTaskHistory(req, res);
    assert.strictEqual(res.statusCode, 200);

    // 7c. Project Head -> 200
    req = { params: { taskId: taskIdA }, user: { userId: projectHeadId, role: "user" } };
    res = createMockRes();
    await getTaskHistory(req, res);
    assert.strictEqual(res.statusCode, 200);

    // 7d. Assigned Member -> 200
    req = { params: { taskId: taskIdA }, user: { userId: assignedMemberId, role: "user" } };
    res = createMockRes();
    await getTaskHistory(req, res);
    assert.strictEqual(res.statusCode, 200);

    // 7e. Unassigned Member -> 403
    req = { params: { taskId: taskIdA }, user: { userId: unassignedMemberId, role: "user" } };
    res = createMockRes();
    await getTaskHistory(req, res);
    assert.strictEqual(res.statusCode, 403);
    assert(res.data.message.includes("permission to view this task history"));
  });

  // 8. Deleting a task also deletes its comments and activity records
  await test("8. Deleting a task deletes comments AND activity records", async () => {
    const task = createMockTask(taskIdA, projectIdA, "low", "todo");
    Task.findById = async () => task;

    const req = {
      params: { taskId: taskIdA },
      user: { userId: ownerId, role: "admin" },
    };
    const res = createMockRes();
    deletedCommentFilter = null;
    deletedActivityFilter = null;

    await deleteTask(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(deletedCommentFilter, { task: taskIdA });
    assert.deepStrictEqual(deletedActivityFilter, { task: taskIdA });
  });

  // 9. Existing task permissions still work
  await test("9. Existing task permissions: assigned member cannot edit priority (403)", async () => {
    const task = createMockTask(taskIdA, projectIdA, "low", "todo", [assignedMemberId]);
    Task.findById = async () => task;

    const req = {
      params: { taskId: taskIdA },
      user: { userId: assignedMemberId, role: "user" },
      body: { priority: "high" },
    };
    const res = createMockRes();
    await updateTask(req, res);

    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.data.message, "Members can only update task status");
  });

  // 10. Safe assigned user ID comparison with populated user objects
  await test("10. Safe assigned user comparison handles populated objects without logging false assignments", async () => {
    const populatedUser = {
      _id: new mongoose.Types.ObjectId(assignedMemberId),
      name: "Assigned User",
      email: "user@test.com",
    };
    const task = createMockTask(taskIdA, projectIdA, "low", "todo");
    task.assignedTo = [populatedUser];
    Task.findById = async () => task;

    activityLogs.length = 0;
    const req = {
      params: { taskId: taskIdA },
      user: { userId: ownerId, role: "admin" },
      body: { priority: "high" }, // Only updating priority, not assignees
    };
    const res = createMockRes();
    await updateTask(req, res);

    assert.strictEqual(res.statusCode, 200);
    // Since assignees didn't change, "assigned" action should NOT be logged
    const assignedLogs = activityLogs.filter((a) => a.action === "assigned");
    assert.strictEqual(assignedLogs.length, 0);
  });

  console.log("\n=======================================================");
  console.log(`RESULTS: ${passedTests}/${totalTests} TESTS PASSED (${failedTests} FAILED)`);
  console.log("=======================================================\n");

  if (failedTests > 0) process.exit(1);
}

runTests();
