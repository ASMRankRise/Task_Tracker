const assert = require("assert");
const mongoose = require("mongoose");

const redis = require("../src/config/redis");
const cacheUtils = require("../src/utils/cache");
const {
  getTaskHistory,
  updateTask,
  deleteTask,
} = require("../src/controllers/task.controller");
const Task = require("../src/models/Task");
const Project = require("../src/models/Project");
const TaskActivity = require("../src/models/TaskActivity");
const Comment = require("../src/models/Comment");

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

async function runTests() {
  console.log("\n=======================================================");
  console.log("TESTING REDIS CACHING FOR TASK ACTIVITY HISTORY");
  console.log("=======================================================\n");

  const taskIdA = new mongoose.Types.ObjectId().toString();
  const taskIdB = new mongoose.Types.ObjectId().toString();
  const projectIdA = new mongoose.Types.ObjectId().toString();

  const ownerId = new mongoose.Types.ObjectId().toString();
  const headId = new mongoose.Types.ObjectId().toString();
  const assignedUserId = new mongoose.Types.ObjectId().toString();
  const unauthorizedUserId = new mongoose.Types.ObjectId().toString();

  const mockProject = {
    _id: projectIdA,
    name: "Cache Test Project",
    owner: ownerId,
    projectHead: headId,
    members: [ownerId, headId, assignedUserId, unauthorizedUserId],
  };

  const mockTaskA = {
    _id: taskIdA,
    title: "Task A",
    status: "todo",
    priority: "low",
    project: mockProject,
    assignedTo: [{ _id: assignedUserId, name: "Assigned Dev", email: "assigned@test.com" }],
    save: async function () { return this; },
    populate: async function () { return this; },
    deleteOne: async function () { return { deletedCount: 1 }; },
  };

  const mockTaskB = {
    _id: taskIdB,
    title: "Task B",
    status: "todo",
    priority: "medium",
    project: mockProject,
    assignedTo: [{ _id: assignedUserId, name: "Assigned Dev", email: "assigned@test.com" }],
    save: async function () { return this; },
    populate: async function () { return this; },
  };

  // Mock in-memory redis storage for test
  const memoryStore = new Map();
  const originalGet = redis.get;
  const originalSet = redis.set;
  const originalIncr = redis.incr;

  redis.get = async (key) => {
    return memoryStore.has(key) ? memoryStore.get(key) : null;
  };
  redis.set = async (key, val, options) => {
    memoryStore.set(key, val);
    return "OK";
  };
  redis.incr = async (key) => {
    const cur = Number(memoryStore.get(key) || 0) + 1;
    memoryStore.set(key, cur);
    return cur;
  };

  let dbQueryCount = 0;
  let dbActivitiesA = [
    {
      _id: "act_1",
      task: taskIdA,
      user: { _id: ownerId, name: "Project Owner", email: "owner@test.com" },
      action: "created",
      field: "task",
      oldValue: null,
      newValue: "Task A",
      createdAt: new Date("2026-11-19T10:00:00.000Z"),
    },
  ];

  let dbActivitiesB = [
    {
      _id: "act_b1",
      task: taskIdB,
      user: { _id: ownerId, name: "Project Owner", email: "owner@test.com" },
      action: "created",
      field: "task",
      oldValue: null,
      newValue: "Task B",
      createdAt: new Date("2026-11-19T10:00:00.000Z"),
    },
  ];

  function createQuery(t) {
    if (!t) return null;
    return {
      ...t,
      populate: async () => t,
    };
  }

  Task.findById = (id) => {
    const idStr = String(id?._id || id);
    if (idStr === taskIdA) return createQuery(mockTaskA);
    if (idStr === taskIdB) return createQuery(mockTaskB);
    return null;
  };

  Project.findById = async () => mockProject;
  Comment.deleteMany = async () => ({ deletedCount: 1 });

  TaskActivity.find = ({ task }) => ({
    populate: () => ({
      sort: async () => {
        dbQueryCount++;
        const tId = String(task?._id || task);
        if (tId === taskIdA) return dbActivitiesA;
        if (tId === taskIdB) return dbActivitiesB;
        return [];
      },
    }),
  });

  TaskActivity.insertMany = async (docs) => {
    docs.forEach((doc) => {
      dbActivitiesA.unshift({
        _id: new mongoose.Types.ObjectId().toString(),
        ...doc,
        user: { _id: doc.user, name: "Updater", email: "user@test.com" },
        createdAt: new Date(),
      });
    });
    return docs;
  };

  TaskActivity.deleteMany = async () => ({ deletedCount: 1 });

  // -------------------------------------------------------------
  // Test 1: Authorization check executes BEFORE cache access
  // -------------------------------------------------------------
  console.log("Test 1: Unauthorized user blocked before cache access (403)");
  const reqUnauth = {
    params: { taskId: taskIdA },
    user: { userId: unauthorizedUserId, role: "user" },
  };
  const resUnauth = createMockRes();
  await getTaskHistory(reqUnauth, resUnauth);
  assert.strictEqual(resUnauth.statusCode, 403);
  assert(resUnauth.data.message.includes("permission"));
  console.log("  ✓ Unauthorized user blocked with 403, no activities leaked\n");

  // -------------------------------------------------------------
  // Test 2: Cache Miss on initial authorized fetch
  // -------------------------------------------------------------
  console.log("Test 2: Cache Miss fetches from MongoDB and populates Redis");
  dbQueryCount = 0;
  const reqAuthA = {
    params: { taskId: taskIdA },
    user: { userId: assignedUserId, role: "user" },
  };
  const resAuth1 = createMockRes();
  await getTaskHistory(reqAuthA, resAuth1);
  assert.strictEqual(resAuth1.statusCode, 200);
  assert.strictEqual(dbQueryCount, 1, "Expected 1 DB query on cache miss");
  assert.strictEqual(resAuth1.data.activities.length, 1);
  assert.strictEqual(resAuth1.data.activities[0].action, "created");

  const versionKeyA = cacheUtils.getTaskHistoryVersionKey(taskIdA);
  const cacheKeyA = cacheUtils.getTaskHistoryCacheKey(taskIdA, 0);
  assert(memoryStore.has(cacheKeyA), "Expected Redis to contain cached key");
  console.log(`  ✓ MongoDB queried on miss, saved to Redis at key: ${cacheKeyA}\n`);

  // -------------------------------------------------------------
  // Test 3: Cache Hit on subsequent fetch (No DB query)
  // -------------------------------------------------------------
  console.log("Test 3: Cache Hit serves directly from Redis (0 DB queries)");
  dbQueryCount = 0;
  const resAuth2 = createMockRes();
  await getTaskHistory(reqAuthA, resAuth2);
  assert.strictEqual(resAuth2.statusCode, 200);
  assert.strictEqual(dbQueryCount, 0, "Expected 0 DB queries on cache hit");
  assert.strictEqual(resAuth2.data.activities.length, 1);
  console.log("  ✓ Cache hit verified: served from Redis with 0 database queries\n");

  // -------------------------------------------------------------
  // Test 4: Task B has its own independent cache key
  // -------------------------------------------------------------
  console.log("Test 4: Task B cached independently without collision");
  const reqAuthB = {
    params: { taskId: taskIdB },
    user: { userId: ownerId, role: "admin" },
  };
  const resAuthB = createMockRes();
  await getTaskHistory(reqAuthB, resAuthB);
  assert.strictEqual(resAuthB.statusCode, 200);
  const cacheKeyB = cacheUtils.getTaskHistoryCacheKey(taskIdB, 0);
  assert(memoryStore.has(cacheKeyB), "Expected Task B cached independently");
  console.log(`  ✓ Task B cached at independent key: ${cacheKeyB}\n`);

  // -------------------------------------------------------------
  // Test 5: Cache Invalidation when Task A updates
  // -------------------------------------------------------------
  console.log("Test 5: Updating Task A increments version and invalidates only Task A");
  const initialVersionB = memoryStore.get(cacheUtils.getTaskHistoryVersionKey(taskIdB)) || 0;

  const reqUpdateA = {
    params: { taskId: taskIdA },
    user: { userId: ownerId, role: "admin" },
    body: { status: "in-progress" },
  };
  const resUpdate = createMockRes();
  await updateTask(reqUpdateA, resUpdate);
  assert.strictEqual(resUpdate.statusCode, 200);

  const updatedVersionA = memoryStore.get(versionKeyA);
  assert.strictEqual(updatedVersionA, 1, "Expected Task A version incremented to 1");

  const currentVersionB = memoryStore.get(cacheUtils.getTaskHistoryVersionKey(taskIdB)) || 0;
  assert.strictEqual(currentVersionB, initialVersionB, "Task B cache version must remain unchanged");
  console.log("  ✓ Task A version incremented (0 -> 1). Task B cache remains untouched\n");

  // -------------------------------------------------------------
  // Test 6: Next request for Task A fetches fresh data
  // -------------------------------------------------------------
  console.log("Test 6: Post-invalidation request fetches fresh activities");
  dbQueryCount = 0;
  const resFreshA = createMockRes();
  await getTaskHistory(reqAuthA, resFreshA);
  assert.strictEqual(resFreshA.statusCode, 200);
  assert.strictEqual(dbQueryCount, 1, "Expected DB fetch after version increment");
  assert.strictEqual(resFreshA.data.activities.length, 2, "Expected 2 activities (created + status_changed)");
  assert.strictEqual(resFreshA.data.activities[0].action, "status_changed");

  const newCacheKeyA = cacheUtils.getTaskHistoryCacheKey(taskIdA, 1);
  assert(memoryStore.has(newCacheKeyA), "Expected new cache key populated");
  console.log(`  ✓ Fresh data retrieved and cached at new version key: ${newCacheKeyA}\n`);

  // -------------------------------------------------------------
  // Test 7: Task deletion invalidates history cache
  // -------------------------------------------------------------
  console.log("Test 7: Task deletion invalidates task history cache");
  const versionBeforeDelete = memoryStore.get(versionKeyA);
  const reqDelete = {
    params: { taskId: taskIdA },
    user: { userId: ownerId, role: "admin" },
  };
  const resDelete = createMockRes();
  await deleteTask(reqDelete, resDelete);
  assert.strictEqual(resDelete.statusCode, 200);

  const versionAfterDelete = memoryStore.get(versionKeyA);
  assert.strictEqual(versionAfterDelete, versionBeforeDelete + 1);
  console.log("  ✓ Task deletion incremented version key\n");

  // -------------------------------------------------------------
  // Test 8: Redis Failure Fallback (Resilient API)
  // -------------------------------------------------------------
  console.log("Test 8: Graceful MongoDB fallback if Redis throws an error");
  redis.get = async () => {
    throw new Error("Redis cluster unavailable");
  };
  redis.set = async () => {
    throw new Error("Redis cluster unavailable");
  };

  dbQueryCount = 0;
  const resFallback = createMockRes();
  await getTaskHistory(reqAuthB, resFallback);
  assert.strictEqual(resFallback.statusCode, 200);
  assert.strictEqual(dbQueryCount, 1, "Expected DB fallback on Redis error");
  assert(Array.isArray(resFallback.data.activities));
  console.log("  ✓ API returned HTTP 200 from MongoDB when Redis threw an error\n");

  // Restore redis mocks
  redis.get = originalGet;
  redis.set = originalSet;
  redis.incr = originalIncr;

  console.log("=======================================================");
  console.log("ALL REDIS CACHING TESTS PASSED (8/8)");
  console.log("=======================================================\n");
}

runTests().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
