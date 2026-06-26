// Standalone embedded-postgres bootstrap (dev-only helper).
// Run with: node scripts/start-pg.mjs
// Starts the embedded cluster, prints a clear "ready" line, then keeps the
// process alive (Ctrl-C to stop). The drizzle-kit push command can connect
// while this is running.
import EmbeddedPostgres from "embedded-postgres";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.POSTGRES_PORT ?? "54329");
const password = process.env.POSTGRES_PASSWORD ?? "password";
const database = process.env.POSTGRES_DB ?? "jarvis";

const pg = new EmbeddedPostgres({
  databaseDir: path.join(root, ".pgdata"),
  user: "postgres",
  password,
  port,
  persistent: true,
});

const dataDir = path.join(root, ".pgdata");
if (!existsSync(path.join(dataDir, "PG_VERSION"))) {
  await pg.initialise();
}
await pg.start();
try {
  await pg.createDatabase(database);
} catch {}
console.log(`[pg] ready on 127.0.0.1:${port}, db=${database}`);
// Keep alive until SIGINT
process.on("SIGINT", async () => {
  await pg.stop();
  process.exit(0);
});
// Long-running wait — drizzle-kit push will block waiting for connection
setInterval(() => {}, 60_000);
