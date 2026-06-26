#!/usr/bin/env node
// Bounce the JARVIS api-server in place.
// Why: lib/db/src/index.ts rewrites the connection string so the api-server
// connects as carvis_app instead of postgres once the new dist is built.
// This launcher composes DATABASE_URL from POSTGRES_* keys, kills whatever
// node process is currently bound to :PORT (so we never collide with a
// zombie api-server or get EADDRINUSE), and spawns a fresh detached
// process with stdio piped to log files.

import { spawn, execSync } from "node:child_process";
import { readFileSync, openSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv(env) {
  const text = readFileSync(path.join(root, ".env"), "utf8");
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in env)) env[k] = v;
  }
  return env;
}

function currentPortPid(port) {
  try {
    const out = execSync("netstat -ano", { stdio: ["ignore", "pipe", "ignore"] }).toString();
    for (const line of out.split(/\r?\n/)) {
      if (/LISTENING/i.test(line) && new RegExp(":\\b" + port + "\\b").test(line) && /0\.0\.0\.0/.test(line)) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (/^\d+$/.test(pid)) return Number(pid);
      }
    }
  } catch {}
  return null;
}

function killPort(port) {
  const prev = currentPortPid(port);
  if (!prev) {
    console.log("no listener on :" + port);
    return;
  }
  try {
    execSync("taskkill /F /T /PID " + prev, { stdio: "inherit" });
    console.log("killed previous api pid=" + prev);
  } catch (e) {
    console.log("kill previous api pid=" + prev + " failed: " + e.message);
  }
}

const env = loadEnv({ ...process.env });
const port = env.POSTGRES_PORT ?? "54329";
const password = env.POSTGRES_PASSWORD ?? "password";
const database = env.POSTGRES_DB ?? "jarvis";
env.DATABASE_URL = `postgresql://postgres:${password}@127.0.0.1:${port}/${database}`;
env.NODE_ENV = "development";
env.PORT = env.API_PORT ?? "8080";
env.APP_URL = env.APP_URL ?? `http://localhost:${env.WEB_PORT ?? "20034"}`;

const apiPort = Number(env.PORT);
killPort(apiPort);
await new Promise((r) => setTimeout(r, 1500));

const outLog = openSync(path.join(root, "scripts", "api.log"), "a");
const errLog = openSync(path.join(root, "scripts", "api.err.log"), "a");

const child = spawn("node", ["artifacts/api-server/dist/index.mjs"], {
  cwd: root,
  env,
  stdio: ["ignore", outLog, errLog],
  detached: true,
  windowsHide: true,
});
child.unref();
console.log("spawned detached api pid: " + child.pid);
