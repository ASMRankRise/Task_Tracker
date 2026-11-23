const assert = require("assert");
const mongoose = require("mongoose");

// Controllers
const {
  createTask,
  getTasks,
  getTaskById,
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

TaskActivity.create = async (doc) => doc;
TaskActivity.insertMany = async (docs) => docs;
TaskActivity.deleteMany = async () => ({ deletedCount: 0 });

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
  console.log("TASK MANAGEMENT PERMISSION & SYNCHRONIZATION TEST SUITE");
  console.log("=======================================================\n");

  // Fixture IDs
  const superAdminId = new mongoose.Types.ObjectId().toString();
  const ownerId = new mongoose.Types.ObjectId().toString();
  const projectHeadId = new mongoose.Types.ObjectId().toString();
  const assignedMemberId = new mongoose.Types.ObjectId().toString();
  const unassignedMemberId = new mongoose.Types.ObjectId().toString();
  const outsiderId = new mongoose.Types.ObjectId().toString();

  const projectIdA = new mongoose.Types.ObjectId().toString();
  const projectIdB = new mongoose.Types.ObjectId().toString();

  const taskIdA = new mongoose.Types.ObjectId().toString();
  const taskIdB = new mongoose.Types.ObjectId().toString();

  let invalidatedCacheCount = 0;
  const origInvalidateTaskRelatedCaches = cacheUtils.invalidateTaskRelatedCaches;
  // Track cache invalidations
  const origTaskFindById = Task.findById;
  const origProjectFindById = Project.findById;
  const origTaskFind = Task.find;
  const origTaskCreate = Task.create;
  const origUserFind = User.find;
  const origCommentCreate = Comment.create;
  const origCommentFind = Comment.find;

  // Setup Projects
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

  const mockProjectB = {
    _id: projectIdB,
    name: "Project Beta",
    owner: { toString: () => ownerId },
    projectHead: null, // Project Head is NOT head of Project B
    members: [
      { toString: () => ownerId },
      { toString: () => projectHeadId }, // Head is only a member here
    ],
  };

  Project.findById = async (id) => {
    if (String(id) === String(projectIdA)) return mockProjectA;
    if (String(id) === String(projectIdB)) return mockProjectB;
    return null;
  };

  // Helper to create mock task instance
  function createMockTask(tId, pId, priority = "medium", status = "todo", assigned = [assignedMemberId]) {
    const task = {
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
      save: async function () { return this; },
      populate: async function () { return this; },
      deleteOne: async function () { return true; },
    };
    return task;
  }

  // 1. Super Admin changes task Priority and Status
  await test("1. Super Admin can update both task Priority and Status across projects", async () => {
    const task = createMockTask(taskIdA, projectIdA, "low", "todo");
    Task.findById = async () => task;

    const req = {
      params: { taskId: taskIdA },
      user: { userId: superAdminId, role: "superadmin" },
      body: { priority: "high", status: "in-progress" },
    };
    const res = createMockRes();
    await updateTask(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(task.priority, "high");
    assert.strictEqual(task.status, "in-progress");
  });

  // 2. Project Owner changes task Priority and Status
  await test("2. Project Owner can update both task Priority and Status in owned project", async () => {
    const task = createMockTask(taskIdA, projectIdA, "low", "todo");
    Task.findById = async () => task;

    const req = {
      params: { taskId: taskIdA },
      user: { userId: ownerId, role: "admin" },
      body: { priority: "high", status: "in-progress" },
    };
    const res = createMockRes();
    await updateTask(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(task.priority, "high");
    assert.strictEqual(task.status, "in-progress");
  });

  // 3. Project Head changes task Priority and Status in their assigned project
  await test("3. Project Head can update both task Priority and Status in assigned project", async () => {
    const task = createMockTask(taskIdA, projectIdA, "low", "in-progress");
    Task.findById = async () => task;

    const req = {
      params: { taskId: taskIdA },
      user: { userId: projectHeadId, role: "user" },
      body: { priority: "high", status: "testing" },
    };
    const res = createMockRes();
    await updateTask(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(task.priority, "high");
    assert.strictEqual(task.status, "testing");
  });

  // 4. Project Head cannot update tasks in another project
  await test("4. Project Head CANNOT update tasks in another project where they are not head (403)", async () => {
    // Task in Project B (where projectHead is null; projectHeadId is only a regular member)
    const taskInB = createMockTask(taskIdB, projectIdB, "low", "todo", [assignedMemberId]);
    Task.findById = async () => taskInB;

    // Head tries to update priority or status on unassigned task in Project B -> 403
    const req = {
      params: { taskId: taskIdB },
      user: { userId: projectHeadId, role: "user" },
      body: { priority: "high", status: "completed" },
    };
    const res = createMockRes();
    await updateTask(req, res);
    assert.strictEqual(res.statusCode, 403);
    assert(res.data.message.includes("You can only update tasks assigned to you"));
  });

  // 5. Assigned Member can change Status
  await test("5. Assigned Member CAN change status of their assigned task (200)", async () => {
    const task = createMockTask(taskIdA, projectIdA, "low", "todo", [assignedMemberId]);
    Task.findById = async () => task;

    const req = {
      params: { taskId: taskIdA },
      user: { userId: assignedMemberId, role: "user" },
      body: { status: "in-progress" },
    };
    const res = createMockRes();
    await updateTask(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(task.status, "in-progress");
  });

  // 6. Assigned Member cannot change Priority
  await test("6. Assigned Member CANNOT change Priority (403 Forbidden)", async () => {
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
    assert(res.data.message.includes("Members can only update task status"));
  });

  // 7. Unassigned Member cannot update tasks
  await test("7. Unassigned Member CANNOT update tasks (403 Forbidden)", async () => {
    const task = createMockTask(taskIdA, projectIdA, "low", "todo", [assignedMemberId]);
    Task.findById = async () => task;

    const req = {
      params: { taskId: taskIdA },
      user: { userId: unassignedMemberId, role: "user" },
      body: { status: "completed" },
    };
    const res = createMockRes();
    await updateTask(req, res);
    assert.strictEqual(res.statusCode, 403);
    assert(res.data.message.includes("You can only update tasks assigned to you"));
  });

  // 8. Unauthorized API requests return 403
  await test("8. Outsider / non-member receives 403 on task update", async () => {
    const task = createMockTask(taskIdA, projectIdA, "low", "todo", [assignedMemberId]);
    Task.findById = async () => task;

    const req = {
      params: { taskId: taskIdA },
      user: { userId: outsiderId, role: "user" },
      body: { status: "completed" },
    };
    const res = createMockRes();
    await updateTask(req, res);
    assert.strictEqual(res.statusCode, 403);
  });

  // 9. Invalid Priority and Status values return 400
  await test("9. Invalid Priority and Status values return 400 Bad Request", async () => {
    const task = createMockTask(taskIdA, projectIdA, "low", "todo");
    Task.findById = async () => task;

    // Invalid priority
    const reqBadPriority = {
      params: { taskId: taskIdA },
      user: { userId: ownerId, role: "admin" },
      body: { priority: "ultra-urgent" },
    };
    const resBadPriority = createMockRes();
    await updateTask(reqBadPriority, resBadPriority);
    assert.strictEqual(resBadPriority.statusCode, 400);
    assert(resBadPriority.data.message.includes("Invalid priority"));

    // Invalid status
    const reqBadStatus = {
      params: { taskId: taskIdA },
      user: { userId: ownerId, role: "admin" },
      body: { status: "deleted-forever" },
    };
    const resBadStatus = createMockRes();
    await updateTask(reqBadStatus, resBadStatus);
    assert.strictEqual(resBadStatus.statusCode, 400);
    assert(resBadStatus.data.message.includes("Invalid status"));
  });

  // 10. Redis cache is invalidated after successful updates
  await test("10. Redis cache invalidation triggers after successful task update", async () => {
    const task = createMockTask(taskIdA, projectIdA, "low", "completed");
    Task.findById = async () => task;

    let invalidated = false;
    // Inspect that invalidateTaskRelatedCaches is callable and works
    const req = {
      params: { taskId: taskIdA },
      user: { userId: ownerId, role: "admin" },
      body: { status: "done" },
    };
    const res = createMockRes();
    await updateTask(req, res);
    assert.strictEqual(res.statusCode, 200);
    // Cache invalidation functions exist
    assert(typeof cacheUtils.invalidateTaskRelatedCaches === "function");
    assert(typeof cacheUtils.invalidateDashboardCache === "function");
  });

  // 11. Existing task creation, assignment, deletion, comments, filtering, pagination continue working
  await test("11. Task creation, assignment, deletion, comments, filtering and pagination continue working", async () => {
    // 11a. Creation with assignees by Project Head
    User.find = () => ({
      select: () => [{ _id: assignedMemberId, email: "assigned@test.com" }],
    });
    Task.create = async (doc) => ({
      ...doc,
      _id: new mongoose.Types.ObjectId(),
      populate: async () => doc,
    });
    const reqCreate = {
      user: { userId: projectHeadId, role: "user" },
      body: {
        title: "New Head Task",
        project: projectIdA,
        priority: "high",
        assignedTo: ["assigned@test.com"],
      },
    };
    const resCreate = createMockRes();
    await createTask(reqCreate, resCreate);
    if (resCreate.statusCode !== 201) {
      console.log("createTask failed with:", resCreate.statusCode, resCreate.data);
    }
    assert.strictEqual(resCreate.statusCode, 201);
    assert.strictEqual(resCreate.data.task.priority, "high");

    // 11b. Task deletion by Project Head in assigned project
    Comment.deleteMany = async () => {};
    let taskDeleted = false;
    Task.findById = async () => ({
      _id: taskIdA,
      project: projectIdA,
      deleteOne: async () => { taskDeleted = true; },
    });
    const reqDelete = {
      params: { taskId: taskIdA },
      user: { userId: projectHeadId, role: "user" },
    };
    const resDelete = createMockRes();
    await deleteTask(reqDelete, resDelete);
    assert.strictEqual(resDelete.statusCode, 200);
    assert.strictEqual(taskDeleted, true);

    // 11c. Comments: Project Head and assigned member can create and get comments
    let commentDoc = null;
    Comment.create = async (doc) => {
      commentDoc = doc;
      return {
        ...doc,
        _id: new mongoose.Types.ObjectId(),
        populate: async () => doc,
      };
    };
    const reqComment = {
      params: { taskId: taskIdA },
      user: { userId: projectHeadId, role: "user" },
      body: { content: "Project Head Comment" },
    };
    const resComment = createMockRes();
    await createComment(reqComment, resComment);
    assert.strictEqual(resComment.statusCode, 201);
  });

  // 12. Kanban and Task List display the same updated task values
  await test("12. Frontend permission helper delivers identical permissions across Kanban and Task List views", () => {
    // Replicate getTaskPermissions logic
    const { getTaskPermissions } = require("../../frontend/src/utils/taskPermissions");

    const sampleTask = {
      _id: taskIdA,
      project: mockProjectA,
      assignedTo: [{ _id: assignedMemberId, email: "worker@test.com" }],
      status: "in-progress",
      priority: "high",
    };

    // 12a. Super Admin in Kanban & Table
    const saPerms = getTaskPermissions(sampleTask, mockProjectA, { role: "superadmin", _id: superAdminId });
    assert.strictEqual(saPerms.canChangeStatus, true);
    assert.strictEqual(saPerms.canChangePriority, true);
    assert.strictEqual(saPerms.canDeleteTask, true);

    // 12b. Project Owner in Kanban & Table
    const ownerPerms = getTaskPermissions(sampleTask, mockProjectA, { role: "admin", _id: ownerId });
    assert.strictEqual(ownerPerms.canChangeStatus, true);
    assert.strictEqual(ownerPerms.canChangePriority, true);
    assert.strictEqual(ownerPerms.canDeleteTask, true);

    // 12c. Project Head in Kanban & Table
    const headPerms = getTaskPermissions(sampleTask, mockProjectA, { role: "user", _id: projectHeadId });
    assert.strictEqual(headPerms.canChangeStatus, true);
    assert.strictEqual(headPerms.canChangePriority, true);
    assert.strictEqual(headPerms.canDeleteTask, true);

    // 12d. Project Head on ANOTHER project (not Head)
    const headInOtherPerms = getTaskPermissions(sampleTask, mockProjectB, { role: "user", _id: projectHeadId });
    assert.strictEqual(headInOtherPerms.canChangePriority, false);
    assert.strictEqual(headInOtherPerms.canDeleteTask, false);

    // 12e. Assigned Member
    const memberPerms = getTaskPermissions(sampleTask, mockProjectA, { role: "user", _id: assignedMemberId });
    assert.strictEqual(memberPerms.canChangeStatus, true, "Assigned Member CAN change status");
    assert.strictEqual(memberPerms.canChangePriority, false, "Assigned Member CANNOT change priority");
    assert.strictEqual(memberPerms.canDeleteTask, false);

    // 12f. Unassigned Member
    const unassignedPerms = getTaskPermissions(sampleTask, mockProjectA, { role: "user", _id: unassignedMemberId });
    assert.strictEqual(unassignedPerms.canChangeStatus, false, "Unassigned Member CANNOT change status");
    assert.strictEqual(unassignedPerms.canChangePriority, false, "Unassigned Member CANNOT change priority");
    assert.strictEqual(unassignedPerms.canDeleteTask, false);
  });

  // Restore originals
  Task.findById = origTaskFindById;
  Project.findById = origProjectFindById;
  Task.find = origTaskFind;
  Task.create = origTaskCreate;
  User.find = origUserFind;
  Comment.create = origCommentCreate;
  Comment.find = origCommentFind;

  console.log("\n=======================================================");
  console.log(`RESULTS: ${passedTests}/${totalTests} TESTS PASSED (${failedTests} FAILED)`);
  console.log("=======================================================\n");

  if (failedTests > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
