require("dotenv").config();
const { spawnSync } = require("child_process");

async function setSuperAdmin() {
  const email = process.argv[2]?.trim().toLowerCase();
  const isRemote = process.argv.includes("--remote") || !process.argv.includes("--local");
  const targetFlag = isRemote ? "--remote" : "--local";

  if (!email || email.startsWith("--")) {
    console.log("Usage: node scripts/setSuperAdmin.js <email> [--remote | --local]");
    process.exitCode = 1;
    return;
  }

  const safeEmail = email.replace(/'/g, "''");
  const sql = `UPDATE users SET role = 'superadmin', token_version = token_version + 1, updated_at = datetime('now') WHERE email = '${safeEmail}' COLLATE NOCASE;`;

  console.log(`Setting Super Admin for '${email}' (${targetFlag})...`);
  const wranglerCmd = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(
    wranglerCmd,
    ["wrangler", "d1", "execute", "taskmanagementsys", targetFlag, "--command", sql],
    { stdio: "inherit", shell: true },
  );

  if (result.status !== 0) {
    process.exitCode = result.status || 1;
  } else {
    console.log(`Success: Role updated to superadmin in D1.`);
  }
}

setSuperAdmin();


