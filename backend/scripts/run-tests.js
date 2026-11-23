const { spawnSync } = require("child_process");

const suites = [
  "run-complete-audit-suite.js",
  "test-task-fixes.js",
  "test-task-history-caching.js",
  "test-task-priority-status-permissions.js",
  "verify-authorization.js",
  "verify-permissions-hierarchy.js",
];

for (const suite of suites) {
  const result = spawnSync(process.execPath, [`scripts/${suite}`], {
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log(`\nAll ${suites.length} backend test suites passed.`);
