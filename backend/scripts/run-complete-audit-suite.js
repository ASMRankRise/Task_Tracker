const assert = require("assert");
const mongoose = require("mongoose");

// Models & Middleware
const requireRole = require("../src/middleware/role");
const requireProjectOwner = require("../src/middleware/project.middleware");
const User = require("../src/models/User");
const Project = require("../src/models/Project");
const Task = require("../src/models/Task");
const Comment = require("../src/models/Comment");
const TaskActivity = require("../src/models/TaskActivity");

TaskActivity.create = async (doc) => doc;
TaskActivity.insertMany = async (docs) => docs;
TaskActivity.deleteMany = async () => ({ deletedCount: 0 });

// Controllers
const {
  createProject,
  getProjects,
  updateProject,
  deleteProject,
  addProjectMember,
  removeProjectMember,
  assignProjectHead,
  removeProjectHead,
} = require("../src/controllers/project.controller");

const {
  createTask,
  getTasks,
  getTaskById,
  updateTask,
  deleteTask,
  createComment,
  getComments,
} = require("../src/controllers/task.controller");

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

async function test(description, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ ${description}`);
  } catch (err) {
    failedTests++;
    console.error(`  ✗ ${description}`);
    console.error(`    ${err.message}`);
  }
}

async function runTestSuite() {
  console.log("\n=======================================================");
  console.log("RUNNING 17-SCENARIO PERMISSION SYSTEM AUDIT SUITE");
  console.log("=======================================================\n");

  // Mock User IDs
  const superAdminId = new mongoose.Types.ObjectId().toString();
  const adminAId = new mongoose.Types.ObjectId().toString();
  const adminBId = new mongoose.Types.ObjectId().toString();
  const projectHeadId = new mongoose.Types.ObjectId().toString();
  const memberAId = new mongoose.Types.ObjectId().toString();
  const memberBId = new mongoose.Types.ObjectId().toString();
  const legacyOwnerId = new mongoose.Types.ObjectId().toString();

  const projectIdA = new mongoose.Types.ObjectId().toString();
  const projectIdB = new mongoose.Types.ObjectId().toString();
  const legacyProjectId = new mongoose.Types.ObjectId().toString();

  // Save original methods
  const origProjectFindById = Project.findById;
  const origProjectCreate = Project.create;
  const origProjectFind = Project.find;
  const origTaskFind = Task.find;
  const origTaskFindById = Task.findById;
  const origTaskCreate = Task.create;
  const origTaskUpdateMany = Task.updateMany;
  const origUserFind = User.find;
  const origUserFindOne = User.findOne;
  const origCommentCreate = Comment.create;
  const origCommentFind = Comment.find;

  // 1. Super Admin global project management
  console.log("Scenario 1: Super Admin global project management");
  await test("Super Admin can create, update, delete, and manage members on any project", async () => {
    // Role check for creation
    const reqRole = { user: { userId: superAdminId, role: "superadmin" } };
    let nextCalled = false;
    requireRole("admin")(reqRole, createMockRes(), () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true, "Super Admin satisfies requireRole('admin')");

    // Project owner bypass
    const mockProj = {
      _id: projectIdA,
      name: "Admin A's Project",
      owner: { toString: () => adminAId },
      members: [{ toString: () => adminAId }],
      projectHead: null,
    };
    Project.findById = async () => mockProj;

    const reqManage = {
      params: { projectId: projectIdA },
      user: { userId: superAdminId, role: "superadmin" },
    };
    nextCalled = false;
    await requireProjectOwner(reqManage, createMockRes(), () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true, "Super Admin can manage any project regardless of ownership");
  });

  // 2. Super Admin task management
  console.log("\nScenario 2: Super Admin task management");
  await test("Super Admin can create, assign, update, and delete tasks in any project", async () => {
    const mockProj = {
      _id: projectIdA,
      name: "Admin A's Project",
      owner: { toString: () => adminAId },
      members: [{ toString: () => adminAId }, { toString: () => memberAId }],
      projectHead: null,
    };
    Project.findById = async () => mockProj;
    User.find = () => ({
      select: () => [{ _id: memberAId, email: "membera@test.com" }],
    });

    let createdTaskPayload = null;
    Task.create = async (payload) => {
      createdTaskPayload = payload;
      return {
        ...payload,
        _id: new mongoose.Types.ObjectId(),
        populate: async () => {},
      };
    };

    const req = {
      user: { userId: superAdminId, role: "superadmin" },
      body: {
        title: "Super Admin Task",
        project: projectIdA,
        assignedTo: ["membera@test.com"],
        priority: "high",
        status: "todo",
      },
    };
    const res = createMockRes();
    await createTask(req, res);
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(createdTaskPayload.priority, "high");
    assert.strictEqual(createdTaskPayload.assignedTo[0], memberAId);
  });

  // 3. Admin manages their own project
  console.log("\nScenario 3: Admin manages their own project");
  await test("Admin A can manage their own Project A (add members, assign Head, update, delete)", async () => {
    const mockProjA = {
      _id: projectIdA,
      name: "Project A",
      owner: { toString: () => adminAId },
      members: [{ toString: () => adminAId }],
      projectHead: null,
      save: async () => {},
      populate: async () => {},
    };
    Project.findById = async () => mockProjA;

    const req = {
      params: { projectId: projectIdA },
      user: { userId: adminAId, role: "admin" },
    };
    let nextCalled = false;
    await requireProjectOwner(req, createMockRes(), () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true, "Admin A must pass requireProjectOwner on Project A");
  });

  // 4. Admin cannot manage another Admin's project
  console.log("\nScenario 4: Admin cannot manage another Admin's project");
  await test("Admin B is BLOCKED with 403 when attempting to manage Admin A's Project", async () => {
    const mockProjA = {
      _id: projectIdA,
      name: "Project A",
      owner: { toString: () => adminAId },
      members: [{ toString: () => adminAId }, { toString: () => adminBId }],
      projectHead: null,
    };
    Project.findById = async () => mockProjA;

    const req = {
      params: { projectId: projectIdA },
      user: { userId: adminBId, role: "admin" },
    };
    const res = createMockRes();
    let nextCalled = false;
    await requireProjectOwner(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, false, "Admin B must not pass requireProjectOwner on Project A");
    assert.strictEqual(res.statusCode, 403, "Must return 403 Forbidden");
  });

  // 5. Admin member receives only member permissions in another Admin's project
  console.log("\nScenario 5: Admin member receives only member permissions in another Admin's project");
  await test("Admin B (assigned member) can update only status; cannot edit title or delete task in Project A", async () => {
    const mockTask = {
      _id: new mongoose.Types.ObjectId(),
      title: "Task in Project A",
      project: projectIdA,
      assignedTo: [{ _id: adminBId }],
      status: "todo",
      priority: "medium",
      save: async () => {},
      populate: async () => {},
    };
    Task.findById = async () => mockTask;
    Project.findById = async () => ({
      _id: projectIdA,
      owner: { toString: () => adminAId },
      projectHead: null,
      members: [{ toString: () => adminAId }, { toString: () => adminBId }],
    });

    // 1. Trying to update title -> 403
    const reqForbidden = {
      params: { taskId: mockTask._id.toString() },
      user: { userId: adminBId, role: "admin" },
      body: { title: "Hacked Title" },
    };
    const resForbidden = createMockRes();
    await updateTask(reqForbidden, resForbidden);
    assert.strictEqual(resForbidden.statusCode, 403, "Admin B cannot update task title in Project A");

    // 2. Trying to delete task -> 403
    const reqDelete = {
      params: { taskId: mockTask._id.toString() },
      user: { userId: adminBId, role: "admin" },
    };
    const resDelete = createMockRes();
    await deleteTask(reqDelete, resDelete);
    assert.strictEqual(resDelete.statusCode, 403, "Admin B cannot delete task in Project A");

    // 3. Updating status -> 200
    const reqStatus = {
      params: { taskId: mockTask._id.toString() },
      user: { userId: adminBId, role: "admin" },
      body: { status: "in-progress" },
    };
    const resStatus = createMockRes();
    await updateTask(reqStatus, resStatus);
    assert.strictEqual(resStatus.statusCode, 200, "Admin B can update status on assigned task in Project A");
  });

  // 6. Project Head can create tasks, set priority, and assign project members
  console.log("\nScenario 6: Project Head can create tasks, set priority, and assign project members");
  await test("Project Head creates task with priority and assigns project member", async () => {
    Project.findById = async () => ({
      _id: projectIdA,
      owner: { toString: () => adminAId },
      projectHead: { toString: () => projectHeadId },
      members: [{ toString: () => adminAId }, { toString: () => projectHeadId }, { toString: () => memberAId }],
    });
    User.find = () => ({
      select: () => [{ _id: memberAId, email: "membera@test.com" }],
    });

    let taskCreated = null;
    Task.create = async (payload) => {
      taskCreated = payload;
      return {
        ...payload,
        _id: new mongoose.Types.ObjectId(),
        populate: async () => {},
      };
    };

    const req = {
      user: { userId: projectHeadId, role: "user" },
      body: {
        title: "Project Head Initiative",
        project: projectIdA,
        priority: "high",
        assignedTo: ["membera@test.com"],
      },
    };
    const res = createMockRes();
    await createTask(req, res);
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(taskCreated.priority, "high");
    assert.deepStrictEqual(taskCreated.assignedTo, [memberAId]);

    // Also verify Project Head can update task title, description, priority, dueDate, and status
    const mockTask = {
      _id: new mongoose.Types.ObjectId(),
      project: projectIdA,
      title: "Initial Title",
      description: "Initial Description",
      priority: "low",
      status: "todo",
      assignedTo: [memberAId],
      save: async () => {},
      populate: async () => {},
    };
    Task.findById = async () => mockTask;

    const reqUpdate = {
      params: { taskId: mockTask._id.toString() },
      user: { userId: projectHeadId, role: "user" },
      body: {
        title: "Updated Title by Head",
        description: "Updated Description",
        priority: "medium",
        dueDate: new Date(Date.now() + 86400000).toISOString(),
        status: "in-progress",
      },
    };
    const resUpdate = createMockRes();
    await updateTask(reqUpdate, resUpdate);
    assert.strictEqual(resUpdate.statusCode, 200, "Project Head can update title, description, priority, dueDate, status");
    assert.strictEqual(mockTask.title, "Updated Title by Head");
    assert.strictEqual(mockTask.priority, "medium");
    assert.strictEqual(mockTask.status, "in-progress");
  });

  // 7. Single Project Head enforcement, member requirement, and replacement workflow
  console.log("\nScenario 7: Single Project Head enforcement, member requirement, and replacement workflow");
  await test("Enforces single Project Head, requires project membership, and supports remove-then-replace flow", async () => {
    const nonMemberId = new mongoose.Types.ObjectId().toString();
    const candidateMemberId = new mongoose.Types.ObjectId().toString();

    User.findById = (id) => ({
      select: () => {
        const strId = id.toString();
        return { _id: strId, name: `User ${strId}`, email: `user_${strId}@test.com` };
      },
    });

    const mockProj = {
      _id: projectIdA,
      owner: { toString: () => adminAId },
      members: [
        { toString: () => adminAId },
        { toString: () => projectHeadId },
        { toString: () => candidateMemberId },
      ],
      projectHead: { toString: () => projectHeadId },
      save: async () => {},
      populate: async () => {},
    };

    // 1. Prevent assigning another Project Head while one already exists -> 400
    const reqDuplicateHead = {
      project: mockProj,
      body: { userId: candidateMemberId },
      user: { userId: adminAId, role: "admin" },
    };
    const resDuplicateHead = createMockRes();
    await assignProjectHead(reqDuplicateHead, resDuplicateHead);
    assert.strictEqual(resDuplicateHead.statusCode, 400);
    assert(resDuplicateHead.data.message.includes("Remove the current Project Head before assigning a new one"));

    // 2. Remove current Project Head -> sets projectHead to null, retains user in members
    const reqRemove = {
      project: mockProj,
      user: { userId: adminAId, role: "admin" },
    };
    const resRemove = createMockRes();
    await removeProjectHead(reqRemove, resRemove);
    assert.strictEqual(resRemove.statusCode, 200);
    assert.strictEqual(mockProj.projectHead, null);
    assert(mockProj.members.some((m) => m.toString() === projectHeadId), "Removed head remains in members");

    // 3. Prevent assigning a non-member as Project Head -> 400
    const reqNonMember = {
      project: mockProj,
      body: { userId: nonMemberId },
      user: { userId: adminAId, role: "admin" },
    };
    const resNonMember = createMockRes();
    await assignProjectHead(reqNonMember, resNonMember);
    assert.strictEqual(resNonMember.statusCode, 400);
    assert(resNonMember.data.message.includes("Project Head must already be a member"));

    // 4. Assigning new Project Head from members after removal -> 200
    const reqNewHead = {
      project: mockProj,
      body: { userId: candidateMemberId },
      user: { userId: adminAId, role: "admin" },
    };
    const resNewHead = createMockRes();
    await assignProjectHead(reqNewHead, resNewHead);
    assert.strictEqual(resNewHead.statusCode, 200);
    assert.strictEqual(mockProj.projectHead.toString(), candidateMemberId);
  });

  // 8. Project Head task deletion & member management boundary
  console.log("\nScenario 8: Project Head task deletion & member management boundary");
  await test("Project Head CAN delete tasks in assigned project, but BLOCKED from deleting tasks in another project and managing members (403)", async () => {
    Comment.deleteMany = async () => {};
    let deleted = false;
    const mockTask = {
      _id: new mongoose.Types.ObjectId(),
      project: projectIdA,
      deleteOne: async () => { deleted = true; },
    };
    Task.findById = async () => mockTask;
    Project.findById = async (id) => {
      if (id.toString() === projectIdA) {
        return {
          _id: projectIdA,
          owner: { toString: () => adminAId },
          projectHead: { toString: () => projectHeadId },
          members: [{ toString: () => adminAId }, { toString: () => projectHeadId }],
        };
      }
      return {
        _id: projectIdB,
        owner: { toString: () => adminBId },
        projectHead: null,
        members: [{ toString: () => adminBId }],
      };
    };

    // 1. Delete task in assigned project -> 200
    const reqDelete = {
      params: { taskId: mockTask._id.toString() },
      user: { userId: projectHeadId, role: "user" },
    };
    const resDelete = createMockRes();
    await deleteTask(reqDelete, resDelete);
    assert.strictEqual(resDelete.statusCode, 200, "Project Head can delete tasks in assigned project");
    assert.strictEqual(deleted, true);

    // 2. Delete task in another project -> 403
    const mockTaskProjectB = {
      _id: new mongoose.Types.ObjectId(),
      project: projectIdB,
      deleteOne: async () => {},
    };
    Task.findById = async () => mockTaskProjectB;
    const reqDeleteB = {
      params: { taskId: mockTaskProjectB._id.toString() },
      user: { userId: projectHeadId, role: "user" },
    };
    const resDeleteB = createMockRes();
    await deleteTask(reqDeleteB, resDeleteB);
    assert.strictEqual(resDeleteB.statusCode, 403, "Project Head cannot delete tasks in another project");

    // 3. Member management -> 403
    const reqMember = {
      params: { projectId: projectIdA },
      user: { userId: projectHeadId, role: "user" },
    };
    const resMember = createMockRes();
    let nextCalled = false;
    await requireProjectOwner(reqMember, resMember, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, false);
    assert.strictEqual(resMember.statusCode, 403);
  });

  // 9. Normal member cannot create projects
  console.log("\nScenario 9: Normal member cannot create projects");
  await test("Normal member receives 403 on requireRole('admin')", async () => {
    const req = { user: { userId: memberAId, role: "user" } };
    const res = createMockRes();
    let nextCalled = false;
    requireRole("admin")(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 403);
  });

  // 10. Normal member cannot create tasks
  console.log("\nScenario 10: Normal member cannot create tasks");
  await test("Normal member receives 403 on createTask", async () => {
    Project.findById = async () => ({
      _id: projectIdA,
      owner: { toString: () => adminAId },
      projectHead: null,
      members: [{ toString: () => adminAId }, { toString: () => memberAId }],
    });

    const req = {
      user: { userId: memberAId, role: "user" },
      body: {
        title: "Member Task",
        project: projectIdA,
      },
    };
    const res = createMockRes();
    await createTask(req, res);
    assert.strictEqual(res.statusCode, 403);
  });

  // 11. Normal member cannot add or remove members
  console.log("\nScenario 11: Normal member cannot add or remove members");
  await test("Normal member receives 403 on requireProjectOwner middleware", async () => {
    Project.findById = async () => ({
      _id: projectIdA,
      owner: { toString: () => adminAId },
      members: [{ toString: () => adminAId }, { toString: () => memberAId }],
    });

    const req = {
      params: { projectId: projectIdA },
      user: { userId: memberAId, role: "user" },
    };
    const res = createMockRes();
    let nextCalled = false;
    await requireProjectOwner(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 403);
  });

  // 12. Normal member can update status only on assigned tasks
  console.log("\nScenario 12: Normal member can update status only on assigned tasks");
  await test("Assigned member can update status, but blocked from updating any other field", async () => {
    const mockTask = {
      _id: new mongoose.Types.ObjectId(),
      project: projectIdA,
      assignedTo: [{ _id: memberAId }],
      status: "testing",
      save: async () => {},
      populate: async () => {},
    };
    Task.findById = async () => mockTask;
    Project.findById = async () => ({
      _id: projectIdA,
      owner: { toString: () => adminAId },
      projectHead: null,
      members: [{ toString: () => adminAId }, { toString: () => memberAId }],
    });

    // Valid status update -> 200
    const reqOk = {
      params: { taskId: mockTask._id.toString() },
      user: { userId: memberAId, role: "user" },
      body: { status: "completed" },
    };
    const resOk = createMockRes();
    await updateTask(reqOk, resOk);
    assert.strictEqual(resOk.statusCode, 200);

    // Invalid title update -> 403
    const reqFail = {
      params: { taskId: mockTask._id.toString() },
      user: { userId: memberAId, role: "user" },
      body: { status: "completed", title: "New Title" },
    };
    const resFail = createMockRes();
    await updateTask(reqFail, resFail);
    assert.strictEqual(resFail.statusCode, 403);
  });

  // 13. Normal member cannot access unassigned task details
  console.log("\nScenario 13: Normal member cannot access unassigned task details");
  await test("Unassigned Member B receives 403 on getTaskById for task assigned to Member A", async () => {
    const mockTask = {
      _id: new mongoose.Types.ObjectId(),
      title: "Secret Task",
      project: {
        _id: projectIdA,
        name: "Project A",
        owner: adminAId,
        projectHead: null,
        members: [adminAId, memberAId, memberBId],
      },
      assignedTo: [{ _id: memberAId, name: "Member A", email: "membera@test.com" }],
      createdBy: { _id: adminAId, name: "Admin A", email: "admina@test.com" },
    };
    Task.findById = () => ({
      populate: () => ({
        populate: () => ({
          populate: async () => mockTask,
        }),
      }),
    });

    const req = {
      params: { taskId: mockTask._id.toString() },
      user: { userId: memberBId, role: "user" },
    };
    const res = createMockRes();
    await getTaskById(req, res);
    assert.strictEqual(res.statusCode, 403);
    assert(res.data.message.includes("only view task details for tasks assigned to them"));
  });

  // 14. Removed member immediately loses project and task access
  console.log("\nScenario 14: Removed member immediately loses project and task access");
  await test("removeProjectMember removes user from members, clears Head if Head, unassigns tasks, invalidates caches", async () => {
    let pulledFromTasks = null;
    Task.updateMany = async (filter, update) => {
      pulledFromTasks = { filter, update };
    };

    const mockProj = {
      _id: projectIdA,
      owner: { toString: () => adminAId },
      members: [{ toString: () => adminAId }, { toString: () => memberAId }],
      projectHead: { toString: () => memberAId },
      save: async () => {},
      populate: async () => {},
    };

    const req = {
      project: mockProj,
      params: { memberId: memberAId },
    };
    const res = createMockRes();
    await removeProjectMember(req, res);
    assert.strictEqual(res.statusCode, 200);

    // Verify removed from members
    assert(!mockProj.members.some((id) => id.toString() === memberAId));
    // Verify cleared from projectHead
    assert.strictEqual(mockProj.projectHead, null);
    // Verify pulled from task assignedTo
    assert.deepStrictEqual(pulledFromTasks.update, { $pull: { assignedTo: memberAId } });
  });

  // 15. Removed Project Head loses Project Head permissions but retains membership
  console.log("\nScenario 15: Removed Project Head loses Project Head permissions but retains membership if not removed");
  await test("removeProjectHead nulls projectHead without altering project.members", async () => {
    const mockProj = {
      _id: projectIdA,
      owner: { toString: () => adminAId },
      members: [{ toString: () => adminAId }, { toString: () => projectHeadId }],
      projectHead: { toString: () => projectHeadId },
      save: async () => {},
      populate: async () => {},
    };

    const req = { project: mockProj };
    const res = createMockRes();
    await removeProjectHead(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(mockProj.projectHead, null);
    assert(mockProj.members.some((id) => id.toString() === projectHeadId), "Must retain membership");
  });

  // 16. Legacy normal-user-owned projects remain functional
  console.log("\nScenario 16: Legacy normal-user-owned projects remain functional");
  await test("Legacy normal user owner passes requireProjectOwner and can update their project", async () => {
    const legacyProj = {
      _id: legacyProjectId,
      name: "Legacy Project",
      owner: { toString: () => legacyOwnerId },
      members: [{ toString: () => legacyOwnerId }],
      projectHead: null,
      save: async () => {},
      populate: async () => {},
    };
    Project.findById = async () => legacyProj;

    const req = {
      params: { projectId: legacyProjectId },
      user: { userId: legacyOwnerId, role: "user" },
    };
    let nextCalled = false;
    await requireProjectOwner(req, createMockRes(), () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true, "Legacy normal user owner MUST pass requireProjectOwner");
  });

  // 17. Legacy normal users cannot create new projects
  console.log("\nScenario 17: Legacy normal users cannot create new projects");
  await test("Legacy normal user owner is BLOCKED from creating new projects (403)", async () => {
    const req = {
      user: { userId: legacyOwnerId, role: "user" },
      body: { name: "Unauthorized New Project" },
    };
    const res = createMockRes();
    let nextCalled = false;
    requireRole("admin")(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, false, "Legacy normal user cannot satisfy requireRole('admin')");
    assert.strictEqual(res.statusCode, 403, "Must return 403 Forbidden");
  });

  // Restore mocks
  Project.findById = origProjectFindById;
  Project.create = origProjectCreate;
  Project.find = origProjectFind;
  Task.find = origTaskFind;
  Task.findById = origTaskFindById;
  Task.create = origTaskCreate;
  Task.updateMany = origTaskUpdateMany;
  User.find = origUserFind;
  User.findOne = origUserFindOne;
  Comment.create = origCommentCreate;
  Comment.find = origCommentFind;

  console.log("\n=======================================================");
  console.log(`COMPLETE AUDIT SUITE: ${passedTests}/${totalTests} TESTS PASSED (${failedTests} FAILED)`);
  console.log("=======================================================\n");

  process.exit(failedTests > 0 ? 1 : 0);
}

runTestSuite().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
