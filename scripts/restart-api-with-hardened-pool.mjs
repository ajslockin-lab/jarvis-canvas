#!/usr/bin/env node
// Bounce the running api-server in place.
//
// Why: lib/db/src/index.ts now rewrites the connection string so the api-server
// connects as `carvis_app` instead of `postgres`. The currently running
// api-server (PID 6848, port 8080) was started BEFORE that change, so the
// running process still uses the old pool. This script:
//
//   1. Runs `pnpm --filter @workspace/api-server run build` to compile the
//      new pool config into `dist/index.mjs`.
//   2. Kills the existing api-server process via Windows taskkill.
//   3. Spawns a fresh `node artifacts/api-server/dist/index.mjs` detached so
//      the dev session can use it without holding a Bash slot.
//
// Skip the embedded-postgres start - it's already up since dev.mjs is running.
// On next `pnpm dev` cycle, the orchestrator will rebuild anyway and pick up
// the change for free; this script is just to make the change take effect
// without a full dev reset (which would tear down Postgres + rebuild vite).

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isWindows = process.platform === "win32";

function loadEnvFile() {
  const envPath = path.join(root, ".env");
  try {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch (err) {
    console.error("could not load .env:", err.message);
  }
}

function execCapture(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd ?? root,
      env: { ...process.env, ...opts.env },
      stdio: ["ignore", "pipe", "pipe"],
      shell: isWindows,
    });
    const out = [];
    const err = [];
    child.stdout.on("data", (b) => out.push(b.toString()));
    child.stderr.on("data", (b) => err.push(b.toString()));
    child.on("exit", (code) => {
      if (code === 0) resolve({ stdout: out.join(""), stderr: err.join("") });
      else reject(new Error(`${cmd} exited ${code}: ${err.join("")}`));
    });
  });
}

const require = createRequire(import.meta.url);

async function main() {
  loadEnvFile();

  console.log("Step 1/3: rebuilding api-server bundle...");
  await execCapture("pnpm", ["--filter", "@workspace/api-server", "run", "build"], {
    cwd: root,
  });
  console.log("  rebuilt");

  console.log("Step 2/3: killing existing api-server process...");
  // Pull port 8080 listener PID from netstat.
  const { stdout } = await execCapture("netstat", ["-ano"]);
  let apiPid = null;
  for (const line of stdout.split(/\r?\n/)) {
    if (/LISTENING/i.test(line) && /\b8080\b/.test(line) && /\b0\.0\.0\.0\b/.test(line)) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (/^\d+$/.test(pid)) {
        apiPid = pid;
        break;
      }
    }
  }
  if (!apiPid) {
    console.error("  could not find api pid from netstat — abort");
    process.exit(1);
  }
  console.log("  api pid:", apiPid);

  const { execSync } = require("node:child_process");
  // Use the Windows taskkill via cmd to avoid MSYS path translation issues on
  // forward slashes in /F. /T kills the process tree (its console child).
  execSync(`taskkill /F /T /PID ${apiPid}`, { stdio: "inherit" });

  // Brief pause so the port releases.
  await new Promise((r) => setTimeout(r, 1500));

  console.log("Step 3/3: spawning fresh api-server detached...");
  const apiPort = process.env.API_PORT ?? "8080";
  const webPort = process.env.WEB_PORT ?? "20034";
  const appUrl = process.env.APP_URL ?? `http://localhost:${webPort}`;
  const child = spawn(
    "node",
    ["artifacts/api-server/dist/index.mjs"],
    {
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: "development",
        PORT: apiPort,
        APP_URL: appUrl,
      },
      stdio: "ignore",
      detached: true,
      windowsHide: true,
    }
  );
  child.unref();
  console.log("  spawned detached api pid:", child.pid);

  // Give it a few seconds to bind, then probe /api/health.
  await new Promise((r) => setTimeout(r, 3000));
  try {
    const { execSync: es } = require("node:child_process");
    const out = es(`curl -s -o NUL -w "%{http_code}" http://127.0.0.1:${apiPort}/api/health`, {
      shell: isWindows ? true : "/bin/sh",
    });
    console.log("  api health:", out.toString().trim());
  } catch (err) {
    console.error("  health probe failed:", err.message);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
