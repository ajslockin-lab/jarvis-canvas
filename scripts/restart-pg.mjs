// restart-pg.mjs — force-restart the JARVIS dev stack after the embedded
// postgres crashes (known bug in @embedded-postgres/windows-x64 18.4.0-beta).
// Idempotent: safe to run while dev.mjs is mid-startup.

import { spawn, execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function killPid(pid) {
  try {
    const out = execSync(`taskkill /F /PID ${pid}`, { stdio: ["ignore", "pipe", "ignore"] }).toString();
    console.log(`killed ${pid}: ${out.trim()}`);
  } catch (err) {
    const msg = err.stderr ? err.stderr.toString() : err.message;
    if (msg.includes("not found") || msg.includes("could not find")) return;
    console.log(`kill ${pid}: ${msg.trim().split("\n").pop()}`);
  }
}

// 1. Kill hung drizzle-kit push spawned by post-merge.sh (it pins a DB connection
//    that prevents our restart reattaching).
for (const pid of [1905, 1914]) killPid(pid);
// 2. Kill the parent pnpm dev — it owns the dead embedded-postgres and is
//    stuck because its watchdog hit MAX_RESTARTS without notifying us.
for (const pid of [1741, 39488, 38532]) killPid(pid);

// 3. Give OS a beat to reap, then sweep any leftover postgres child.
await new Promise((r) => setTimeout(r, 1500));
try {
  const stdout = execSync("tasklist /fo csv /nh", { stdio: ["ignore", "pipe", "ignore"] }).toString();
  const matches = stdout
    .split("\n")
    .map((line) => line.match(/^"([^"]+)","(\d+)"/))
    .filter(Boolean)
    .filter(([, name, pid]) => {
      const n = name.toLowerCase();
      return n.includes("postgres") || n.includes("pg_ctl") || (n === "node.exe" && pid === "37056");
    });
  for (const [, , pid] of matches) killPid(pid);
} catch {}

// 4. Wipe the stale embedded-postgres lock so the next start() doesn't refuse.
const pidFile = path.join(root, ".pgdata", "postmaster.pid");
if (existsSync(pidFile)) {
  rmSync(pidFile, { force: true });
  console.log(`removed stale ${path.relative(root, pidFile)}`);
}

// 5. Hand off to pnpm dev which will re-create the cluster, push the schema,
//    and start the API + frontend.
console.log("starting pnpm dev...");
const child = spawn("pnpm", ["dev"], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
  shell: true,
});
child.on("exit", (code) => process.exit(code ?? 0));
