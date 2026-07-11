import app from "./app";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";
import { startSyncScheduler, stopSyncScheduler } from "./lib/sync-scheduler.js";
import { startReminderScheduler, stopReminderScheduler } from "./lib/reminder-scheduler.js";

// Default to 8080 when no PORT is set. Render/Fly/Railway all inject PORT,
// but Hugging Face Spaces' Docker SDK uses app_port from the Space README
// frontmatter for routing without always setting PORT — defaulting matches
// app_port: 8080 in our README so the container binds there.
const rawPort = process.env["PORT"] ?? "8080";

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Fail-closed: in production, refuse to boot without a real email transport.
// Without this, a deploy that forgets to set RESEND_API_KEY would silently
// fall back to the dev service, which logs OTP codes to stdout and returns
// them in API responses — fine in dev, catastrophic in prod.
if (
  process.env["NODE_ENV"] === "production" &&
  !process.env["RESEND_API_KEY"]
) {
  throw new Error(
    "RESEND_API_KEY is required when NODE_ENV=production. " +
    "Set it to your Resend API key, or unset NODE_ENV for dev mode.",
  );
}

// Process-level error handlers — prevent silent crashes
process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection");
});

process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught exception — shutting down");
  process.exit(1);
});

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Start background Canvas sync scheduler (disabled unless CANVAS_SYNC_ENABLED=true)
  startSyncScheduler();
  // Start background reminder scheduler (disabled unless REMINDER_SCHEDULER_ENABLED=true)
  startReminderScheduler();
});

// Graceful shutdown — drain connections before exiting
let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutting down...");

  stopSyncScheduler();
  stopReminderScheduler();

  // Stop accepting new connections
  server.close(() => {
    logger.info("HTTP server closed");
  });

  // Close database pool
  try {
    await pool.end();
    logger.info("Database pool closed");
  } catch (err) {
    logger.error({ err }, "Error closing database pool");
  }

  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
