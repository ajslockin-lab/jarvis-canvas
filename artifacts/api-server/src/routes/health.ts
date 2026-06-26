import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@workspace/db";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

const Liveness = z.object({ status: z.literal("ok") });

// Liveness: process is up. Cheap, always 200 unless the event loop is wedged.
// Rollouts rely on this — k8s/Render/whatever won't kill a pod that still
// answers this, even if Postgres is briefly unreachable.
router.get("/healthz", (_req, res) => {
  res.json(Liveness.parse({ status: "ok" }));
});

// Readiness: process is up AND can talk to Postgres. Rollouts pause if 5xx
// here so traffic doesn't land on a replica that can't load user data.
// Routes that touch the DB get rate-limited harder than /readyz, but we
// also rate-limit /readyz to keep a tight loop from burning the pool.
router.get("/readyz", async (_req, res) => {
  try {
    // SELECT 1 round-trips through the pool. If statement_timeout (10s on
    // carvis_app role) fires or the pool can't acquire a connection within
    // ~5s, this rejects and we return 503.
    await Promise.race([
      db.execute(sql`SELECT 1`),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("db ping timeout")), 5000),
      ),
    ]);
    res.json(Liveness.parse({ status: "ok" }));
  } catch (err) {
    // 503, not 500: orchestrators treat this as "remove from rotation" not
    // "restart". The error body has no DB-internal detail (intentional) so a
    // misconfigured pool doesn't leak the connection string into logs.
    logger.warn({ err }, "Readiness check failed");
    res.status(503).json({
      status: "unready",
      error: "Database ping failed",
      code: "not_ready",
    });
  }
});

export default router;
