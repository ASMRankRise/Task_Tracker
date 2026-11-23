const assert = require("assert");
const fs = require("fs");
const path = require("path");
const requireRole = require("../src/middleware/role");
const requireProjectOwner = require("../src/middleware/project.middleware");
const { updateUserRole } = require("../src/controllers/admin.controller");
const { register } = require("../src/controllers/auth.controller");

let totalTests = 0;
let passedTests = 0;

function test(description, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ ${description}`);
  } catch (err) {
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
    console.error(`  ✗ ${description}`);
    console.error(`    ${err.message}`);
  }
}

console.log("\n=======================================================");
console.log("RUNNING SUPER ADMIN & AUTHORIZATION TEST SUITE");
console.log("=======================================================\n");

// Helper mock functions
const createMockRes = () => {
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
};

// 1. D1 User Schema Validation
console.log("1. D1 User Schema Validation:");

const migrationSql = fs.readFileSync(
  path.join(__dirname, "../migrations/0001_initial_schema.sql"),
  "utf8",
);

test("D1 users table defines the role enum and default user role", () => {
  assert.match(migrationSql, /role TEXT NOT NULL DEFAULT 'user'/);
  assert.match(
    migrationSql,
    /CHECK\s*\(\s*role IN\s*\(\s*'user',\s*'admin',\s*'superadmin'\s*\)\s*\)/,
  );
});

test("D1 users table excludes invalid role values", () => {
  assert(!/role IN\s*\([^)]*'godmode'/.test(migrationSql));
});

test("D1 users table accepts the superadmin role", () => {
  assert.match(migrationSql, /'superadmin'/);
});

// 2. Role Middleware Hierarchy Tests
console.log("\n2. Role Middleware Hierarchy & Access Control:");

test("requireRole rejects unauthenticated user with 401", () => {
  const middleware = requireRole("admin");
  const req = {};
  const res = createMockRes();
  let nextCalled = false;
  middleware(req, res, () => { nextCalled = true; });
  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(nextCalled, false);
});

test("requireRole('admin') blocks standard 'user' with 403", () => {
  const middleware = requireRole("admin");
  const req = { user: { userId: "user123", role: "user" } };
  const res = createMockRes();
  let nextCalled = false;
  middleware(req, res, () => { nextCalled = true; });
  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(nextCalled, false);
});

test("requireRole('admin') allows 'admin' with next()", () => {
  const middleware = requireRole("admin");
  const req = { user: { userId: "admin123", role: "admin" } };
  const res = createMockRes();
  let nextCalled = false;
  middleware(req, res, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, true);
});

test("requireRole('admin') allows 'superadmin' through role hierarchy", () => {
  const middleware = requireRole("admin");
  const req = { user: { userId: "super123", role: "superadmin" } };
  const res = createMockRes();
  let nextCalled = false;
  middleware(req, res, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, true);
});

test("requireRole('superadmin') strictly blocks regular 'admin' with 403", () => {
  const middleware = requireRole("superadmin");
  const req = { user: { userId: "admin123", role: "admin" } };
  const res = createMockRes();
  let nextCalled = false;
  middleware(req, res, () => { nextCalled = true; });
  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(nextCalled, false);
});

test("requireRole('superadmin') allows 'superadmin' with next()", () => {
  const middleware = requireRole("superadmin");
  const req = { user: { userId: "super123", role: "superadmin" } };
  const res = createMockRes();
  let nextCalled = false;
  middleware(req, res, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, true);
});

// 3. Admin Controller Security Guardrails
console.log("\n3. User Role Mutation Security (updateUserRole):");

testAsync("updateUserRole blocks regular Admin from changing roles (403)", async () => {
  const req = {
    user: { userId: "admin99", role: "admin" },
    body: { email: "worker@example.com", role: "admin" },
  };
  const res = createMockRes();
  await updateUserRole(req, res);
  assert.strictEqual(res.statusCode, 403);
  assert(res.data.message.includes("Only Super Admin"));
});

testAsync("updateUserRole blocks standard User from changing roles (403)", async () => {
  const req = {
    user: { userId: "user99", role: "user" },
    body: { email: "worker@example.com", role: "admin" },
  };
  const res = createMockRes();
  await updateUserRole(req, res);
  assert.strictEqual(res.statusCode, 403);
  assert(res.data.message.includes("Only Super Admin"));
});

testAsync("updateUserRole forbids assigning 'superadmin' role via endpoint (400)", async () => {
  const req = {
    user: { userId: "super01", role: "superadmin" },
    body: { email: "worker@example.com", role: "superadmin" },
  };
  const res = createMockRes();
  await updateUserRole(req, res);
  assert.strictEqual(res.statusCode, 400);
  assert(res.data.message.includes("Valid email and role"));
});

// 4. Project Level Ownership & Membership Compatibility
console.log("\n4. Project & Task Permission Compatibility:");

testAsync("requireProjectOwner allows superadmin even if not project owner", async () => {
  // Mock Project.findById
  const originalFindById = require("../src/models/Project").findById;
  require("../src/models/Project").findById = async () => ({
    _id: "proj123",
    owner: "someone_else_id",
    members: [],
  });

  try {
    const req = {
      params: { projectId: "507f1f77bcf86cd799439011" },
      user: { userId: "super_id", role: "superadmin" },
    };
    const res = createMockRes();
    let nextCalled = false;
    await requireProjectOwner(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
  } finally {
    require("../src/models/Project").findById = originalFindById;
  }
});

testAsync("requireProjectOwner blocks regular admin if not project owner (403)", async () => {
  const originalFindById = require("../src/models/Project").findById;
  require("../src/models/Project").findById = async () => ({
    _id: "proj123",
    owner: "someone_else_id",
    members: [],
  });

  try {
    const req = {
      params: { projectId: "507f1f77bcf86cd799439011" },
      user: { userId: "admin_id", role: "admin" },
    };
    const res = createMockRes();
    let nextCalled = false;
    await requireProjectOwner(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, false, "Admin without ownership must be blocked");
    assert.strictEqual(res.statusCode, 403, "Must return 403");
  } finally {
    require("../src/models/Project").findById = originalFindById;
  }
});

testAsync("requireProjectOwner blocks regular user if not project owner (403)", async () => {
  const originalFindById = require("../src/models/Project").findById;
  require("../src/models/Project").findById = async () => ({
    _id: "proj123",
    owner: "someone_else_id",
    members: [],
  });

  try {
    const req = {
      params: { projectId: "507f1f77bcf86cd799439011" },
      user: { userId: "user_id", role: "user" },
    };
    const res = createMockRes();
    let nextCalled = false;
    await requireProjectOwner(req, res, () => { nextCalled = true; });
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(nextCalled, false);
  } finally {
    require("../src/models/Project").findById = originalFindById;
  }
});

testAsync("requireProjectOwner allows project owner even if regular user", async () => {
  const originalFindById = require("../src/models/Project").findById;
  const ownerId = "507f1f77bcf86cd799439099";
  require("../src/models/Project").findById = async () => ({
    _id: "507f1f77bcf86cd799439011",
    owner: { toString: () => ownerId },
    members: [],
  });

  try {
    const req = {
      params: { projectId: "507f1f77bcf86cd799439011" },
      user: { userId: ownerId, role: "user" },
    };
    const res = createMockRes();
    let nextCalled = false;
    await requireProjectOwner(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
  } finally {
    require("../src/models/Project").findById = originalFindById;
  }
});

// Run async tests summary
setTimeout(() => {
  console.log("\n=======================================================");
  console.log(`TEST SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log("=======================================================\n");
  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}, 500);
