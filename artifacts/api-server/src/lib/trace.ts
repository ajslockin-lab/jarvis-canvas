import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

// ponytail: src/lib/trace.ts walked `..` × N to reach the monorepo root, but
// that count is wrong once esbuild bundles modules into dist/index.mjs (one
// fewer directory). Picking the log dir from an env var sidesteps the count
// entirely — leave SIGNIN_TRACE_PATH unset and the trace just dumps to stdout.
const logPath = process.env["SIGNIN_TRACE_PATH"] ?? null;
if (logPath) {
  mkdirSync(path.dirname(logPath), { recursive: true });
}

export const trace = (label: string, payload: unknown) => {
  // ponytail — no-op when env var isn't set: tests/users without a writable
  // log dir don't crash on the very first call.
  if (!logPath) return;
  try {
    appendFileSync(
      logPath,
      `${new Date().toISOString()} ${label} pid=${process.pid} cwd=${process.cwd()} ${JSON.stringify(payload)}\n`,
    );
  } catch {
    // intentionally swallowed — tracing is best-effort and the user already
    // raised it once from a tmp-fallback; an off-by-one path bug shouldn't
    // break sign-in.
  }
};
