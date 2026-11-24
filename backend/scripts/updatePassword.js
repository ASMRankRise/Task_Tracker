require("dotenv").config();
const { spawnSync } = require("child_process");
const bcrypt = require("bcryptjs");

async function updatePassword() {
  const email = process.argv[2]?.trim().toLowerCase();
  const password = process.argv[3];
  const isRemote = !process.argv.includes("--local");
  const targetFlag = isRemote ? "--remote" : "--local";

  if (!email || !password) {
    console.log("Usage: node scripts/updatePassword.js <email> <newPassword> [--local | --remote]");
    process.exitCode = 1;
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const safeHash = hashedPassword.replace(/'/g, "''");
  const safeEmail = email.replace(/'/g, "''");

  const sql = `UPDATE users SET password = '${safeHash}', token_version = token_version + 1, updated_at = datetime('now') WHERE (email = '${safeEmail}' OR email = '${safeEmail.replace("opration", "oprations")}') COLLATE NOCASE;`;

  console.log(`Updating password for '${email}' in D1 (${targetFlag})...`);
  const wranglerCmd = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(
    wranglerCmd,
    ["wrangler", "d1", "execute", "taskmanagementsys", targetFlag, "--command", sql],
    { stdio: "inherit" },
  );

  if (result.status !== 0) {
    process.exitCode = result.status || 1;
  } else {
    console.log(`Success: Password updated successfully.`);
  }
}

updatePassword();
