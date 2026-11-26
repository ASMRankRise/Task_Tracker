const assert = require("assert");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

// Models & Middleware
const requireRole = require("../src/middleware/role");
const requireProjectOwner = require("../src/middleware/project.middleware");
const User = require("../src/models/User");
const Project = require("../src/models/Project");
const Task = require("../src/models/Task");
const Comment = require("../src/models/Comment");

// Controllers
const {
  createProject,
  getProjects,
  updateProject,
  deleteProject,
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

const { getDashboard } = require("../src/controllers/dashboard.controller");
const cacheUtils = require("../src/utils/cache");
const TaskActivity = require("../src/models/TaskActivity");

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

function test(description, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ ${description}`);
  } catch (err) {
    failedTests++;
    console.error(`  ✗ ${description}`);
    console.error(`    ${err.message}`);
  }
}

async function testAsync(description, fn) {
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

async function runAllTests() {
  console.log("\n=======================================================");
  console.log("RUNNING FOUR-LEVEL PERMISSION HIERARCHY VERIFICATION");
  console.log("=======================================================\n");

  // 1. Schema Validation
  console.log("1. Project & Comment Schema Validations:");
  const migrationSql = fs.readFileSync(
    path.join(__dirname, "../migrations/0001_initial_schema.sql"),
    "utf8",
  );

  test("D1 projects table has an optional project head foreign key", () => {
    assert.match(migrationSql, /project_head_id TEXT,/);
    assert.match(
      migrationSql,
      /FOREIGN KEY\s*\(project_head_id\)\s*REFERENCES users\(id\)/,
    );
  });

  test("D1 comments table requires content and all relationships", () => {
    assert.match(migrationSql, /content TEXT NOT NULL/);
    assert.match(migrationSql, /task_id TEXT NOT NULL/);
    assert.match(migrationSql, /project_id TEXT NOT NULL/);
    assert.match(migrationSql, /user_id TEXT NOT NULL/);
  });

  // 2. requireProjectOwner Middleware
  console.log("\n2. Project Owner Middleware & Admin Isolation:");

  const adminAId = new mongoose.Types.ObjectId().toString();
  const adminBId = new mongoose.Types.ObjectId().toString();
  const superAdminId = new mongoose.Types.ObjectId().toString();
  const normalUserId = new mongoose.Types.ObjectId().toString();
  const proj1Id = new mongoose.Types.ObjectId().toString();

  const mockProjectA = {
    _id: proj1Id,
    name: "Admin A Project",
    owner: { toString: () => adminAId },
    members: [{ toString: () => adminBId }],
    projectHead: null,
  };

  const origProjectFindById = Project.findById;

  await testAsync("requireProjectOwner allows Super Admin", async () => {
    Project.findById = async () => mockProjectA;
    const req = {
      params: { projectId: proj1Id },
      user: { userId: superAdminId, role: "superadmin" },
    };
    const res = createMockRes();
    let nextCalled = false;
    await requireProjectOwner(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true, "Super Admin should pass");
  });

  await testAsync("requireProjectOwner allows owning Admin", async () => {
    Project.findById = async () => mockProjectA;
    const req = {
      params: { projectId: proj1Id },
      user: { userId: adminAId, role: "admin" },
    };
    const res = createMockRes();
    let nextCalled = false;
    await requireProjectOwner(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true, "Owning admin should pass");
  });

  await testAsync("requireProjectOwner allows existing normal-user owner (backward compatibility)", async () => {
    const normalUserProj = {
      _id: proj1Id,
      name: "User Owned Project",
      owner: { toString: () => normalUserId },
      members: [],
      projectHead: null,
    };
    Project.findById = async () => normalUserProj;
    const req = {
      params: { projectId: proj1Id },
      user: { userId: normalUserId, role: "user" },
    };
    const res = createMockRes();
    let nextCalled = false;
    await requireProjectOwner(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true, "Existing normal-user owner must retain project management permissions");
  });

  await testAsync("requireProjectOwner BLOCKS Admin B on Admin A's project (403)", async () => {
    Project.findById = async () => mockProjectA;
    const req = {
      params: { projectId: proj1Id },
      user: { userId: adminBId, role: "admin" },
    };
    const res = createMockRes();
    let nextCalled = false;
    await requireProjectOwner(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, false, "Admin B must not pass requireProjectOwner");
    assert.strictEqual(res.statusCode, 403, "Must return 403");
  });

  await testAsync("requireProjectOwner BLOCKS Project Head from managing project (403)", async () => {
    const headUserId = new mongoose.Types.ObjectId().toString();
    const mockProjWithHead = {
      ...mockProjectA,
      projectHead: { toString: () => headUserId },
    };
    Project.findById = async () => mockProjWithHead;
    const req = {
      params: { projectId: proj1Id },
      user: { userId: headUserId, role: "user" },
    };
    const res = createMockRes();
    let nextCalled = false;
    await requireProjectOwner(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, false, "Project Head cannot manage project");
    assert.strictEqual(res.statusCode, 403);
  });

  // 3. Project Head Assignment and Removal
  console.log("\n3. Project Head Assignment & Removal Operations:");

  await testAsync("assignProjectHead enforces single head, requires member, and supports removal/replacement", async () => {
    const targetUserId = new mongoose.Types.ObjectId().toString();
    const candidate2Id = new mongoose.Types.ObjectId().toString();
    const nonMemberId = new mongoose.Types.ObjectId().toString();

    const origUserFindById = User.findById;
    User.findById = (id) => ({
      select: () => {
        const strId = id ? id.toString() : "";
        return { _id: strId, name: `User ${strId}`, email: `user_${strId}@example.com` };
      },
    });

    let saved = false;
    const projectInstance = {
      ...mockProjectA,
      members: [
        { toString: () => adminAId },
        { toString: () => targetUserId },
        { toString: () => candidate2Id },
      ],
      projectHead: null,
      save: async function () { saved = true; },
      populate: async function () { return this; },
    };

    // 1. Assigning a member as Project Head succeeds -> 200
    const req = {
      project: projectInstance,
      body: { userId: targetUserId },
      user: { userId: adminAId, role: "admin" },
    };
    const res = createMockRes();
    await assignProjectHead(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(projectInstance.projectHead.toString(), targetUserId);

    // 2. Prevent assigning another Project Head while one is assigned -> 400
    const reqDuplicate = {
      project: projectInstance,
      body: { userId: candidate2Id },
      user: { userId: adminAId, role: "admin" },
    };
    const resDuplicate = createMockRes();
    await assignProjectHead(reqDuplicate, resDuplicate);
    assert.strictEqual(resDuplicate.statusCode, 400, "Cannot assign when Project Head already exists");

    // 3. Remove Project Head -> 200, sets null, user remains in members
    const removeRes = createMockRes();
    await removeProjectHead(req, removeRes);
    assert.strictEqual(removeRes.statusCode, 200);
    assert.strictEqual(projectInstance.projectHead, null);
    assert(projectInstance.members.some((m) => m.toString() === targetUserId), "Target user remains in members");

    // 4. Prevent assigning non-member as Project Head -> 400
    const reqNonMember = {
      project: projectInstance,
      body: { userId: nonMemberId },
      user: { userId: adminAId, role: "admin" },
    };
    const resNonMember = createMockRes();
    await assignProjectHead(reqNonMember, resNonMember);
    assert.strictEqual(resNonMember.statusCode, 400, "Target must be an existing member");

    // 5. Replace Project Head after removal -> 200
    const reqReplace = {
      project: projectInstance,
      body: { userId: candidate2Id },
      user: { userId: adminAId, role: "admin" },
    };
    const resReplace = createMockRes();
    await assignProjectHead(reqReplace, resReplace);
    assert.strictEqual(resReplace.statusCode, 200);
    assert.strictEqual(projectInstance.projectHead.toString(), candidate2Id);

    User.findById = origUserFindById;
  });

  // 4. Task Creation Permissions
  console.log("\n4. Task Creation Permissions & Restrictions:");

  const origTaskCreate = Task.create;
  const origUserFind = User.find;

  await testAsync("createTask allows Project Owner to assign tasks", async () => {
    const projId = new mongoose.Types.ObjectId();
    const memberId = new mongoose.Types.ObjectId();
    Project.findById = async () => ({
      _id: projId,
      owner: { toString: () => adminAId },
      members: [memberId],
      projectHead: null,
    });
    User.find = () => ({
      select: async () => [{ _id: memberId, email: "member@example.com" }],
    });
    Task.create = async (doc) => ({
      ...doc,
      populate: async () => doc,
    });

    const req = {
      user: { userId: adminAId, role: "admin" },
      body: {
        title: "Deploy release",
        project: projId.toString(),
        assignedTo: ["member@example.com"],
        priority: "high",
      },
    };
    const res = createMockRes();
    await createTask(req, res);
    assert.strictEqual(res.statusCode, 201, "Owner should create task");
    assert.strictEqual(res.data.task.priority, "high");
  });

  await testAsync("createTask allows Project Head to set priority and assign members, but BLOCKS assigning non-members", async () => {
    const projId = new mongoose.Types.ObjectId();
    const headId = new mongoose.Types.ObjectId().toString();
    const memberId = new mongoose.Types.ObjectId().toString();
    const nonMemberId = new mongoose.Types.ObjectId().toString();

    Project.findById = async () => ({
      _id: projId,
      owner: { toString: () => adminAId },
      members: [{ toString: () => headId }, { toString: () => memberId }],
      projectHead: { toString: () => headId },
    });

    // 1. Try assigning non-member -> MUST FAIL 400
    User.find = () => ({
      select: async () => [{ _id: nonMemberId, email: "outsider@example.com" }],
    });
    const reqWithNonMember = {
      user: { userId: headId, role: "user" },
      body: {
        title: "Head Task non-member",
        project: projId.toString(),
        assignedTo: ["outsider@example.com"],
      },
    };
    const resNonMember = createMockRes();
    await createTask(reqWithNonMember, resNonMember);
    assert.strictEqual(resNonMember.statusCode, 400, "Cannot assign non-members");

    // 2. Valid Project Head creation with priority and project member -> MUST SUCCEED 201
    User.find = () => ({
      select: async () => [{ _id: memberId, email: "member@example.com" }],
    });
    Task.create = async (doc) => ({
      ...doc,
      populate: async () => doc,
    });
    const reqValid = {
      user: { userId: headId, role: "user" },
      body: {
        title: "Head Task Valid",
        project: projId.toString(),
        priority: "high",
        assignedTo: ["member@example.com"],
      },
    };
    const resValid = createMockRes();
    await createTask(reqValid, resValid);
    assert.strictEqual(resValid.statusCode, 201, "Project Head can create task with priority and members");
    assert.strictEqual(resValid.data.task.priority, "high");
  });

  await testAsync("createTask BLOCKS Admin B (non-owner) and Members with 403", async () => {
    const projId = new mongoose.Types.ObjectId();
    Project.findById = async () => ({
      _id: projId,
      owner: { toString: () => adminAId },
      members: [{ toString: () => adminBId }],
      projectHead: null,
    });

    const reqAdminB = {
      user: { userId: adminBId, role: "admin" },
      body: { title: "Admin B Task", project: projId.toString() },
    };
    const resAdminB = createMockRes();
    await createTask(reqAdminB, resAdminB);
    assert.strictEqual(resAdminB.statusCode, 403, "Admin B cannot create task on Admin A project");

    const reqMember = {
      user: { userId: "some_member_id", role: "user" },
      body: { title: "Member Task", project: projId.toString() },
    };
    const resMember = createMockRes();
    await createTask(reqMember, resMember);
    assert.strictEqual(resMember.statusCode, 403, "Member cannot create task");
  });

  // 5. Task Update Permissions
  console.log("\n5. Task Update Permissions:");

  const origTaskFindById = Task.findById;

  await testAsync("updateTask allows Project Head to edit title, description, due date, status, priority, and assign members", async () => {
    const taskId = new mongoose.Types.ObjectId();
    const projId = new mongoose.Types.ObjectId();
    const headId = new mongoose.Types.ObjectId().toString();
    const memberId = new mongoose.Types.ObjectId().toString();
    const nonMemberId = new mongoose.Types.ObjectId().toString();

    const mockTaskObj = {
      _id: taskId,
      project: projId,
      assignedTo: [{ toString: () => memberId }],
      title: "Old Title",
      status: "todo",
      priority: "low",
      save: async function () { return this; },
      populate: async function () { return this; },
    };

    Task.findById = async () => mockTaskObj;
    Project.findById = async () => ({
      _id: projId,
      owner: { toString: () => adminAId },
      projectHead: { toString: () => headId },
      members: [{ toString: () => headId }, { toString: () => memberId }],
    });

    // 1. Project Head changes priority -> 200
    const reqPriority = {
      params: { taskId: taskId.toString() },
      user: { userId: headId, role: "user" },
      body: { priority: "high" },
    };
    const resPriority = createMockRes();
    await updateTask(reqPriority, resPriority);
    assert.strictEqual(resPriority.statusCode, 200, "Project Head can change priority");
    assert.strictEqual(mockTaskObj.priority, "high");

    // 2. Project Head updates title, description, due date, status -> 200
    const reqValid = {
      params: { taskId: taskId.toString() },
      user: { userId: headId, role: "user" },
      body: {
        title: "New Title by Head",
        description: "New Description by Head",
        dueDate: new Date(Date.now() + 86400000).toISOString(),
        status: "in-progress",
      },
    };
    const resValid = createMockRes();
    await updateTask(reqValid, resValid);
    assert.strictEqual(resValid.statusCode, 200, "Project Head can update title, description, due date, and status");
    assert.strictEqual(mockTaskObj.title, "New Title by Head");
    assert.strictEqual(mockTaskObj.status, "in-progress");

    // 3. Project Head assigns valid project member -> 200
    User.find = () => ({
      select: () => [{ _id: memberId, email: "member@example.com" }],
    });
    const reqAssign = {
      params: { taskId: taskId.toString() },
      user: { userId: headId, role: "user" },
      body: { assignedTo: ["member@example.com"] },
    };
    const resAssign = createMockRes();
    await updateTask(reqAssign, resAssign);
    assert.strictEqual(resAssign.statusCode, 200, "Project Head can assign project members");

    // 4. Project Head tries to assign non-member -> 400
    User.find = () => ({
      select: () => [{ _id: nonMemberId, email: "outsider@example.com" }],
    });
    const reqAssignNonMember = {
      params: { taskId: taskId.toString() },
      user: { userId: headId, role: "user" },
      body: { assignedTo: ["outsider@example.com"] },
    };
    const resAssignNonMember = createMockRes();
    await updateTask(reqAssignNonMember, resAssignNonMember);
    assert.strictEqual(resAssignNonMember.statusCode, 400, "Project Head cannot assign non-members");
  });

  await testAsync("updateTask restricts Member (assigned) strictly to status-only", async () => {
    const taskId = new mongoose.Types.ObjectId();
    const projId = new mongoose.Types.ObjectId();
    const memberId = new mongoose.Types.ObjectId().toString();

    const mockTaskObj = {
      _id: taskId,
      project: projId,
      assignedTo: [{ toString: () => memberId }],
      status: "testing",
      save: async function () { return this; },
      populate: async function () { return this; },
    };

    Task.findById = async () => mockTaskObj;
    Project.findById = async () => ({
      _id: projId,
      owner: { toString: () => adminAId },
      projectHead: null,
      members: [{ toString: () => memberId }],
    });

    // Attempt to update title as Member -> 403
    const reqTitle = {
      params: { taskId: taskId.toString() },
      user: { userId: memberId, role: "user" },
      body: { title: "Member Edited Title" },
    };
    const resTitle = createMockRes();
    await updateTask(reqTitle, resTitle);
    assert.strictEqual(resTitle.statusCode, 403, "Member cannot edit title");

    // Valid status update -> 200
    const reqStatus = {
      params: { taskId: taskId.toString() },
      user: { userId: memberId, role: "user" },
      body: { status: "completed" },
    };
    const resStatus = createMockRes();
    await updateTask(reqStatus, resStatus);
    assert.strictEqual(resStatus.statusCode, 200, "Member can update status");
  });

  // 6. Task Deletion Permissions & Null-Project Fix
  console.log("\n6. Task Deletion & Null-Project Safety:");

  const origCommentDeleteMany = Comment.deleteMany;
  Comment.deleteMany = async () => {};

  await testAsync("deleteTask allows Project Head in assigned project, but BLOCKS in other projects and BLOCKS Members (403)", async () => {
    const taskId = new mongoose.Types.ObjectId();
    const projId = new mongoose.Types.ObjectId();
    const otherProjId = new mongoose.Types.ObjectId();
    const headId = new mongoose.Types.ObjectId().toString();
    const memberId = new mongoose.Types.ObjectId().toString();

    let deleted = false;
    Task.findById = async (id) => ({
      _id: id,
      project: String(id) === String(taskId) ? projId : otherProjId,
      deleteOne: async () => { deleted = true; },
    });
    Project.findById = async (id) => {
      if (String(id) === String(projId)) {
        return {
          _id: projId,
          owner: { toString: () => adminAId },
          projectHead: { toString: () => headId },
        };
      }
      return {
        _id: otherProjId,
        owner: { toString: () => adminAId },
        projectHead: null,
      };
    };

    // 1. Project Head deleting task in assigned project -> 200
    const reqHead = {
      params: { taskId: taskId.toString() },
      user: { userId: headId, role: "user" },
    };
    const resHead = createMockRes();
    await deleteTask(reqHead, resHead);
    assert.strictEqual(resHead.statusCode, 200, "Project Head can delete tasks in assigned project");
    assert.strictEqual(deleted, true);

    // 2. Project Head deleting task in another project -> 403
    const reqHeadOther = {
      params: { taskId: new mongoose.Types.ObjectId().toString() },
      user: { userId: headId, role: "user" },
    };
    const resHeadOther = createMockRes();
    await deleteTask(reqHeadOther, resHeadOther);
    assert.strictEqual(resHeadOther.statusCode, 403, "Project Head cannot delete tasks in other projects");

    // 3. Member deleting task -> 403
    const reqMember = {
      params: { taskId: taskId.toString() },
      user: { userId: memberId, role: "user" },
    };
    const resMember = createMockRes();
    await deleteTask(reqMember, resMember);
    assert.strictEqual(resMember.statusCode, 403, "Members cannot delete tasks");
  });

  await testAsync("deleteTask safely handles null project without TypeError crash", async () => {
    const taskId = new mongoose.Types.ObjectId();
    Task.findById = async () => ({
      _id: taskId,
      project: new mongoose.Types.ObjectId(),
      deleteOne: async () => {},
    });
    // Simulate project already deleted / null
    Project.findById = async () => null;

    const reqNonSuper = {
      params: { taskId: taskId.toString() },
      user: { userId: "some_user_id", role: "user" },
    };
    const resNonSuper = createMockRes();
    // This previously crashed with TypeError
    await deleteTask(reqNonSuper, resNonSuper);
    assert.strictEqual(resNonSuper.statusCode, 403, "Null project handled safely with 403");

    // SuperAdmin can still delete orphaned task
    const reqSuper = {
      params: { taskId: taskId.toString() },
      user: { userId: superAdminId, role: "superadmin" },
    };
    const resSuper = createMockRes();
    await deleteTask(reqSuper, resSuper);
    assert.strictEqual(resSuper.statusCode, 200, "SuperAdmin can delete orphaned task");
  });

  // 7. Task Comments Permissions
  console.log("\n7. Task Comments Permissions:");

  const origCommentCreate = Comment.create;
  const origCommentFind = Comment.find;

  await testAsync("createComment allows SuperAdmin, Owner, and Project Head", async () => {
    const taskId = new mongoose.Types.ObjectId();
    const projId = new mongoose.Types.ObjectId();
    const headId = new mongoose.Types.ObjectId().toString();

    Task.findById = async () => ({ _id: taskId, project: projId });
    Project.findById = async () => ({
      _id: projId,
      owner: { toString: () => adminAId },
      projectHead: { toString: () => headId },
      members: [],
    });
    Comment.create = async (doc) => ({
      ...doc,
      populate: async () => doc,
    });

    // 1. Owner can comment
    const reqOwner = {
      params: { taskId: taskId.toString() },
      user: { userId: adminAId, role: "admin" },
      body: { content: "Owner comment" },
    };
    const resOwner = createMockRes();
    await createComment(reqOwner, resOwner);
    assert.strictEqual(resOwner.statusCode, 201, "Owner can comment");

    // 2. Project Head can comment
    const reqHead = {
      params: { taskId: taskId.toString() },
      user: { userId: headId, role: "user" },
      body: { content: "Head comment" },
    };
    const resHead = createMockRes();
    await createComment(reqHead, resHead);
    assert.strictEqual(resHead.statusCode, 201, "Project Head can comment");

    // 3. Super Admin can comment
    const reqSuper = {
      params: { taskId: taskId.toString() },
      user: { userId: superAdminId, role: "superadmin" },
      body: { content: "Super Admin comment" },
    };
    const resSuper = createMockRes();
    await createComment(reqSuper, resSuper);
    assert.strictEqual(resSuper.statusCode, 201, "Super Admin can comment");
  });

  await testAsync("createComment BLOCKS Members and non-members with 403", async () => {
    const taskId = new mongoose.Types.ObjectId();
    const projId = new mongoose.Types.ObjectId();
    const memberId = new mongoose.Types.ObjectId().toString();

    Task.findById = async () => ({ _id: taskId, project: projId });
    Project.findById = async () => ({
      _id: projId,
      owner: { toString: () => adminAId },
      projectHead: null,
      members: [{ toString: () => memberId }],
    });

    const reqMember = {
      params: { taskId: taskId.toString() },
      user: { userId: memberId, role: "user" },
      body: { content: "Member trying to comment" },
    };
    const resMember = createMockRes();
    await createComment(reqMember, resMember);
    assert.strictEqual(resMember.statusCode, 403, "Member cannot comment");
  });

  await testAsync("getComments allows SuperAdmin, Owner, Project Head, and assigned Member, but BLOCKS unassigned Member", async () => {
    const taskId = new mongoose.Types.ObjectId();
    const projId = new mongoose.Types.ObjectId();
    const headId = new mongoose.Types.ObjectId().toString();
    const assignedMemberId = new mongoose.Types.ObjectId().toString();
    const unassignedMemberId = new mongoose.Types.ObjectId().toString();

    Task.findById = async () => ({
      _id: taskId,
      project: projId,
      assignedTo: [{ _id: assignedMemberId, toString: () => assignedMemberId }],
    });
    Project.findById = async () => ({
      _id: projId,
      owner: { toString: () => adminAId },
      projectHead: { toString: () => headId },
      members: [
        { toString: () => assignedMemberId },
        { toString: () => unassignedMemberId },
      ],
    });

    Comment.find = () => ({
      populate: () => ({
        sort: async () => [{ _id: "c1", content: "Test comment", user: { name: "Author" } }],
      }),
    });

    // 1. Owner can read comments -> 200
    const reqOwner = { params: { taskId: taskId.toString() }, user: { userId: adminAId, role: "admin" } };
    const resOwner = createMockRes();
    await getComments(reqOwner, resOwner);
    assert.strictEqual(resOwner.statusCode, 200, "Owner can read comments");

    // 2. Project Head can read comments -> 200
    const reqHead = { params: { taskId: taskId.toString() }, user: { userId: headId, role: "user" } };
    const resHead = createMockRes();
    await getComments(reqHead, resHead);
    assert.strictEqual(resHead.statusCode, 200, "Project Head can read comments");

    // 3. Assigned Member can read comments -> 200
    const reqAssigned = { params: { taskId: taskId.toString() }, user: { userId: assignedMemberId, role: "user" } };
    const resAssigned = createMockRes();
    await getComments(reqAssigned, resAssigned);
    assert.strictEqual(resAssigned.statusCode, 200, "Assigned Member can read comments");

    // 4. Unassigned Member BLOCKED from reading comments -> 403
    const reqUnassigned = { params: { taskId: taskId.toString() }, user: { userId: unassignedMemberId, role: "user" } };
    const resUnassigned = createMockRes();
    await getComments(reqUnassigned, resUnassigned);
    assert.strictEqual(resUnassigned.statusCode, 403, "Unassigned Member must be blocked from reading comments");
  });

  // 8. Task Detail & List Visibility
  console.log("\n8. Task Detail & List Visibility Sanitization:");

  await testAsync("getTaskById enforces minimum-detail policy for assigned Member (no creator email, no member IDs)", async () => {
    const taskId = new mongoose.Types.ObjectId();
    const projId = new mongoose.Types.ObjectId();
    const assignedMemberId = new mongoose.Types.ObjectId().toString();
    const unassignedMemberId = new mongoose.Types.ObjectId().toString();

    Task.findById = () => ({
      populate: () => ({
        populate: () => ({
          populate: async () => ({
            _id: taskId,
            title: "Secret Task",
            description: "Sensitive specs",
            status: "todo",
            priority: "medium",
            dueDate: new Date(),
            project: {
              _id: projId,
              name: "Alpha Project",
              owner: { toString: () => adminAId },
              projectHead: null,
              members: [
                { toString: () => assignedMemberId },
                { toString: () => unassignedMemberId },
              ],
            },
            assignedTo: [
              { _id: assignedMemberId, name: "Worker One", email: "worker1@secret.com" },
            ],
            createdBy: { _id: adminAId, name: "Boss Admin", email: "boss@secret.com" },
          }),
        }),
      }),
    });

    // Assigned member can view minimum details
    const reqAssigned = {
      params: { taskId: taskId.toString() },
      user: { userId: assignedMemberId, role: "user" },
    };
    const resAssigned = createMockRes();
    await getTaskById(reqAssigned, resAssigned);
    assert.strictEqual(resAssigned.statusCode, 200, "Assigned member can view details");
    
    const taskData = resAssigned.data.task;
    assert.strictEqual(taskData.title, "Secret Task");
    assert.strictEqual(taskData.description, "Sensitive specs");
    assert.strictEqual(taskData.project.name, "Alpha Project");
    assert.strictEqual(taskData.project.members, undefined, "Project member IDs must NOT be exposed");
    assert.strictEqual(taskData.project.owner, undefined, "Project owner ID must NOT be exposed");
    assert.strictEqual(taskData.createdBy.name, "Boss Admin");
    assert.strictEqual(taskData.createdBy.email, undefined, "Creator email must NOT be exposed");
    assert.strictEqual(taskData.assignedTo[0].email, undefined, "Assignee email must NOT be exposed");

    // Unassigned member gets 403
    const reqUnassigned = {
      params: { taskId: taskId.toString() },
      user: { userId: unassignedMemberId, role: "user" },
    };
    const resUnassigned = createMockRes();
    await getTaskById(reqUnassigned, resUnassigned);
    assert.strictEqual(resUnassigned.statusCode, 403, "Unassigned member cannot view details");
  });

  await testAsync("getTasks exposes worker names without emails or descriptions on unassigned project tasks", async () => {
    const projId = new mongoose.Types.ObjectId();
    const assignedMemberId = new mongoose.Types.ObjectId().toString();
    const unassignedMemberId = new mongoose.Types.ObjectId().toString();

    // Mock Project.find for getTasks access check
    Project.find = () => ({
      select: async () => [{ _id: projId }],
    });

    const mockTasks = [
      {
        _id: new mongoose.Types.ObjectId(),
        title: "Assigned Task",
        description: "Visible Description",
        status: "todo",
        priority: "low",
        project: { _id: projId, name: "Project Alpha", owner: adminAId, projectHead: null },
        assignedTo: [{ _id: assignedMemberId, name: "Worker", email: "worker@test.com" }],
        createdBy: { _id: adminAId, name: "Boss", email: "boss@test.com" },
        toObject: function () { return { ...this }; },
      },
      {
        _id: new mongoose.Types.ObjectId(),
        title: "Unassigned Peer Task",
        description: "Confidential Description",
        status: "in-progress",
        priority: "high",
        project: { _id: projId, name: "Project Alpha", owner: adminAId, projectHead: null },
        assignedTo: [{ _id: "peer_id", name: "Peer", email: "peer@secret.com" }],
        createdBy: { _id: adminAId, name: "Boss", email: "boss@secret.com" },
        toObject: function () { return { ...this }; },
      },
    ];

    Task.find = () => ({
      populate: () => ({
        populate: () => ({
          populate: () => ({
            sort: () => ({
              skip: () => ({
                limit: async () => mockTasks,
              }),
            }),
          }),
        }),
      }),
    });
    Task.countDocuments = async () => mockTasks.length;

    const req = {
      user: { userId: assignedMemberId, role: "user" },
      query: { project: projId.toString() },
    };
    const res = createMockRes();
    await getTasks(req, res);
    assert.strictEqual(res.statusCode, 200);

    const returnedTasks = res.data.tasks;
    assert.strictEqual(returnedTasks.length, 2);

    // 1. Task assigned to member: minimum detail, no emails
    const assignedTask = returnedTasks[0];
    assert.strictEqual(assignedTask.title, "Assigned Task");
    assert.strictEqual(assignedTask.description, "Visible Description");
    assert.strictEqual(assignedTask.assignedTo[0].name, "Worker");
    assert.strictEqual(assignedTask.assignedTo[0].email, undefined, "Email must be stripped");
    assert.strictEqual(assignedTask.createdBy.email, undefined, "Creator email must be stripped");
    assert.strictEqual(assignedTask.project.owner, undefined, "Owner ID must be stripped");

    // 2. Task not assigned to member: description/creator/emails stripped, worker name preserved
    const unassignedTask = returnedTasks[1];
    assert.strictEqual(unassignedTask.title, "Unassigned Peer Task");
    assert.strictEqual(unassignedTask.description, "", "Description must be empty");
    assert.strictEqual(unassignedTask.assignedTo.length, 1, "Assigned worker name should be visible on project task");
    assert.strictEqual(unassignedTask.assignedTo[0].name, "Peer", "Worker display name must be exposed");
    assert.strictEqual(unassignedTask.assignedTo[0].email, undefined, "Peer assignee email must still be stripped");
    assert.strictEqual(unassignedTask.createdBy, undefined, "Creator must not be exposed");
    assert.strictEqual(unassignedTask.project.owner, undefined, "Owner ID must be stripped");
  });

  // 9. Redis Cache Invalidation
  console.log("\n9. Redis Cache Invalidation Verification:");

  test("Cache version keys and invalidation functions exist and execute cleanly", async () => {
    assert.strictEqual(cacheUtils.PROJECT_CACHE_VERSION_KEY, "cache:projects:version");
    assert.strictEqual(cacheUtils.TASK_CACHE_VERSION_KEY, "cache:tasks:version");
    assert.strictEqual(cacheUtils.DASHBOARD_CACHE_VERSION_KEY, "cache:dashboard:version");
    assert(typeof cacheUtils.invalidateProjectRelatedCaches === "function");
    assert(typeof cacheUtils.invalidateTaskRelatedCaches === "function");
  });

  // Cleanup restored mocks
  Project.findById = origProjectFindById;
  Task.create = origTaskCreate;
  User.find = origUserFind;
  Task.findById = origTaskFindById;
  Comment.create = origCommentCreate;
  Comment.find = origCommentFind;
  Comment.deleteMany = origCommentDeleteMany;

  console.log("\n=======================================================");
  console.log(`SUITE SUMMARY: ${passedTests}/${totalTests} TESTS PASSED (${failedTests} FAILED)`);
  console.log("=======================================================\n");

  process.exit(failedTests > 0 ? 1 : 0);
}

runAllTests().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
