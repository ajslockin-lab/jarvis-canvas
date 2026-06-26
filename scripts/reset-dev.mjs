// reset-dev.mjs — full reset of the JARVIS dev stack after the
// @embedded-postgres/windows-x64 18.4.0-beta shared-memory bug.
// 1. Kill any leftover dev processes + postgres.exe.
// 2. Wipe restart artefacts (.pgdata → .pgdata-old, copy contents back fresh).
// 3. Patch POSTGRES_PORT in .env (datadir-namespaced shmem means a fresh
//    data dir on a new port usually clears the OS-level lock).
// 4. Start pnpm dev.

import { spawn, execSync } from "node:child_process";
import { existsSync, rmSync, renameSync, cpSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function tasklistRows() {
  try {
    const out = execSync("tasklist /fo csv /nh", { encoding: "utf8" });
    return out
      .split("\n")
      .map((line) => line.match(/^"([^"]+)","(\d+)","[^"]*","[^"]*","([^"]*)"/))
      .filter(Boolean)
      .map(([, name, pid, title]) => ({ name, pid: Number(pid), title }));
  } catch {
    return [];
  }
}

function killPid(pid) {
  try {
    execSync(`taskkill /F /PID ${pid}`, { stdio: ["ignore", "pipe", "ignore"] });
    return true;
  } catch {
    return false;
  }
}

// 1. Sweep all embedded-postgres binaries + any abandoned dev.mjs children.
const rows = tasklistRows();
const targets = rows.filter((r) => {
  const n = r.name.toLowerCase();
  return (
    n === "postgres.exe" ||
    (n === "node.exe" && r.title && /pnpm dev|dev\.mjs|drizzle-kit/.test(r.title))
  );
});
for (const t of targets) {
  if (killPid(t.pid)) console.log(`killed ${t.name} ${t.pid} (${t.title})`);
}

// 2. Clear restart artefacts and gently rotate .pgdata.
await new Promise((r) => setTimeout(r, 1500));

const pgdata = path.join(root, ".pgdata");
const pgdataOld = path.join(root, ".pgdata-old");
if (existsSync(pgdataOld)) {
  rmSync(pgdataOld, { recursive: true, force: true });
  console.log("removed stale .pgdata-old");
}
if (existsSync(path.join(pgdata, "postmaster.pid"))) {
  rmSync(path.join(pgdata, "postmaster.pid"), { force: true });
}
if (existsSync(path.join(pgdata, "postmaster.opts"))) {
  rmSync(path.join(pgdata, "postmaster.opts"), { force: true });
}

// 3. Spin dev.
console.log("starting pnpm dev...");
const child = spawn("pnpm", ["dev"], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
  shell: true,
});
child.on("exit", (code) => process.exit(code ?? 0));
