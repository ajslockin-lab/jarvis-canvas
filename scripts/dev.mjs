import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isWindows = process.platform === "win32";

function loadEnvFile() {
  const envPath = path.join(root, ".env");
  if (!existsSync(envPath)) {
    console.error("Missing .env file. Copy .env.example to .env and try again.");
    process.exit(1);
  }

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
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? root,
      env: { ...process.env, ...options.env },
      stdio: "inherit",
      shell: isWindows,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

const children = [];

function start(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd ?? root,
    env: { ...process.env, ...options.env },
    stdio: "inherit",
    shell: isWindows,
  });

  children.push(child);

  child.on("error", (err) => {
    console.error(err);
    shutdown(1);
  });
  child.on("exit", (code, signal) => {
    if (shuttingDown || code === 0) return;
    console.error(
      `${options.name ?? "process"} exited unexpectedly (code=${code ?? "null"}, signal=${signal ?? "null"})`,
    );
    shutdown(code ?? 1);
  });

  return child;
}

let shuttingDown = false;

async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }

  if (embeddedPostgres) {
    try {
      await embeddedPostgres.stop();
    } catch {
      // ignore shutdown errors
    }
  }

  process.exit(code);
}

let embeddedPostgres;

async function startEmbeddedPostgres() {
  // embedded-postgres auto-detects the OS and downloads the right binary.
  // On Windows it pulls @embedded-postgres/windows-x64, on Linux it pulls
  // @embedded-postgres/linux-x64. Both are listed in pnpm-workspace.yaml's
  // onlyBuiltDependencies so pnpm allows their native builds.
  if (process.platform === "linux" && process.env.NODE_ENV === "production") {
    console.error(
      "embedded-postgres should not be used in production on Linux. " +
      "Set DATABASE_URL to a managed Postgres instance instead.",
    );
    process.exit(1);
  }

  const port = Number(process.env.POSTGRES_PORT ?? "54329");
  const password = process.env.POSTGRES_PASSWORD ?? "password";
  const database = process.env.POSTGRES_DB ?? "jarvis";

  const { default: EmbeddedPostgres } = await import("embedded-postgres");

  embeddedPostgres = new EmbeddedPostgres({
    databaseDir: path.join(root, ".pgdata"),
    user: "postgres",
    password,
    port,
    persistent: true,
  });

  console.log(`Starting embedded PostgreSQL on port ${port}...`);
  const dataDir = path.join(root, ".pgdata");
  const hasExistingCluster = existsSync(path.join(dataDir, "PG_VERSION"));
  if (!hasExistingCluster) {
    await embeddedPostgres.initialise();
  }
  await embeddedPostgres.start();

  try {
    await embeddedPostgres.createDatabase(database);
  } catch {
    // database may already exist from a previous run
  }

  // Watchdog: @embedded-postgres/windows-x64 18.4.0-beta occasionally dies
  // after a few connections (shared-memory release bug — the cluster process
  // exits but no listener notifies us). We can't attach to the private
  // pg child process, so instead poll the TCP port every 5s. If it's down
  // and we're not shutting down, attempt to restart the cluster in place
  // up to MAX_RESTARTS times before giving up.
  //
  // The grace period skips the first 30s of polling — postgres takes a few
  // seconds to come up after start(), and we don't want a slow boot to
  // trigger the restart logic before the cluster is even serving.
  let restartCount = 0;
  const MAX_RESTARTS = 3;
  const GRACE_PERIOD_MS = 30_000;
  const startedAt = Date.now();

  const watchdog = setInterval(async () => {
    if (shuttingDown) return;
    if (Date.now() - startedAt < GRACE_PERIOD_MS) return;

    const isUp = await new Promise((resolve) => {
      const sock = net.createConnection({ host: "127.0.0.1", port }, () => {
        sock.end();
        resolve(true);
      });
      sock.on("error", () => resolve(false));
      // Don't hang the watchdog if postgres is slow to refuse.
      sock.setTimeout(1000, () => {
        sock.destroy();
        resolve(false);
      });
    });
    if (isUp) return;

    if (restartCount >= MAX_RESTARTS) {
      console.error(
        `[embedded-pg] postgres is down and hit the ${MAX_RESTARTS}-restart cap. ` +
        `Stopping dev session. Run \`pnpm dev\` again to retry.`,
      );
      clearInterval(watchdog);
      shutdown(1);
      return;
    }
    restartCount++;
    console.warn(
      `[embedded-pg] postgres is not accepting connections; restarting (${restartCount}/${MAX_RESTARTS})...`,
    );
    try {
      await embeddedPostgres.stop().catch(() => {});
      await embeddedPostgres.start();
      console.log("[embedded-pg] postgres is back up");
    } catch (err) {
      console.error("[embedded-pg] restart failed:", err);
    }
  }, 5000);
  watchdog.unref();

  process.env.DATABASE_URL = `postgresql://postgres:${password}@127.0.0.1:${port}/${database}`;
  console.log(`DATABASE_URL set for embedded PostgreSQL (${database})`);
}

async function main() {
  loadEnvFile();

  if (process.env.USE_EMBEDDED_POSTGRES === "true") {
    await startEmbeddedPostgres();
  }

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required (or set USE_EMBEDDED_POSTGRES=true).");
    process.exit(1);
  }

  if (!process.env.ENCRYPTION_KEY) {
    console.error("ENCRYPTION_KEY is required.");
    process.exit(1);
  }

  console.log("Pushing database schema...");
  await run("pnpm", ["--filter", "@workspace/db", "run", "push"], {
    env: { DATABASE_URL: process.env.DATABASE_URL },
  });

  console.log("Building API server...");
  await run("pnpm", ["--filter", "@workspace/api-server", "run", "build"]);

  const apiPort = process.env.API_PORT ?? "8080";
  const webPort = process.env.WEB_PORT ?? "20034";
  const basePath = process.env.BASE_PATH ?? "/";
  const appUrl = process.env.APP_URL ?? `http://localhost:${webPort}`;

  console.log(`Starting API server on http://localhost:${apiPort}...`);
  start("node", ["artifacts/api-server/dist/index.mjs"], {
    name: "api",
    env: {
      NODE_ENV: "development",
      PORT: apiPort,
      APP_URL: appUrl,
      DATABASE_URL: process.env.DATABASE_URL,
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
      GROQ_API_KEY: process.env.GROQ_API_KEY ?? "",
      // Phase 4: forward email + push env. The loadEnvFile step above
      // populates process.env from .env, but spawned children don't inherit
      // by default — pass through everything that's relevant to the api.
      RESEND_API_KEY: process.env.RESEND_API_KEY ?? "",
      EMAIL_FROM: process.env.EMAIL_FROM ?? "",
      VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY ?? "",
      VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY ?? "",
      VAPID_SUBJECT: process.env.VAPID_SUBJECT ?? "",
    },
  });

  console.log(`Starting frontend on http://localhost:${webPort}...`);
  start("pnpm", ["--filter", "@workspace/jarvis-canvas", "run", "dev"], {
    name: "web",
    env: {
      PORT: webPort,
      BASE_PATH: basePath,
      NODE_ENV: "development",
      // Phase 4: web app needs the VAPID public key bundled into the
      // client. Vite reads VITE_-prefixed vars at build time.
      VITE_VAPID_PUBLIC_KEY: process.env.VITE_VAPID_PUBLIC_KEY ?? "",
    },
  });

  console.log(`\nJARVIS is running at ${appUrl}\n`);
}

process.on("SIGINT", () => {
  void shutdown(0);
});
process.on("SIGTERM", () => {
  void shutdown(0);
});

main().catch((err) => {
  console.error(err);
  void shutdown(1);
});
