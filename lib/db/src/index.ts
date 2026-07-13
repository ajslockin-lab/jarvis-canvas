import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { setDefaultResultOrder } from "node:dns";
import * as schema from "./schema";

// ponytail: Force IPv4-first DNS resolution so cloud hosts that can't route
// IPv6 outbound (notably Hugging Face Spaces free tier) don't pick a dead
// AAAA record for the DB host. Must run before `new Pool()` below — pg uses
// node:net which honors this default for every new connection. Harmless on
// IPv4-only or dual-stack hosts.
setDefaultResultOrder("ipv4first");

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Prefer the non-superuser `carvis_app` role when available — see
// drizzle/0005_security_hardening.sql. Falls back to whatever DATABASE_URL
// points at if the role hasn't been provisioned yet (e.g. fresh checkout
// before the first dev run).
function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL unset");
  if (url.includes("carvis_app")) return url;
  // Rewrite the user from `postgres` to `carvis_app` so migrations and the
  // api-server all hit the role-based connection. Drop the password since
  // `carvis_app` has its own role password set in the migration.
  try {
    const parsed = new URL(url);
    // Only rewrite `postgres` -> `carvis_app` for local dev DBs. Hosted
    // Postgres (Supabase, Neon, Render, etc.) must use the URL the operator
    // provisioned — silently swapping to user `carvis_app` would break
    // auth against the real database role.
    const isLocal =
      parsed.hostname === "localhost" || parsed.hostname.startsWith("127.");
    if (isLocal && parsed.username === "postgres") {
      parsed.username = "carvis_app";
      parsed.password = "carvis_app";
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

export const pool = new Pool({
  connectionString: connectionString(),
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  // statement_timeout is also set via ALTER ROLE for carvis_app; reasserting
  // it here makes the safety net apply even before the role is provisioned.
  statement_timeout: 10_000,
  idle_in_transaction_session_timeout: 30_000,
  application_name: "carvis_api",
});

// Handle pool-level errors (e.g., database disconnect) so they don't crash the process
pool.on("error", (err) => {
  console.error("Unexpected database pool error:", err);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
