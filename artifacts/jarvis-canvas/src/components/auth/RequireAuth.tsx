import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { apiUrl } from "@/lib/api-base";

// ponytail: Source of truth for auth is the httpOnly `jarvis_session` cookie
// (see api-server/src/lib/auth.ts). The cheapest client-side gate is a single
// GET to an already-auth-protected endpoint; /api/user/data exists and returns
// 401 on missing/expired sessions. We cache the result for STALE_MS to avoid
// stacking one ping per <RequireAuth> when several protected routes mount on
// the same page.
const lastResult = { ok: false as boolean, checkedAt: 0 };
const STALE_MS = 30_000;

type State = "checking" | "ok" | "redirecting";

export default function RequireAuth(props: { children: ReactNode }) {
  const [, navigate] = useLocation();
  const [state, setState] = useState<State>(() => {
    if (Date.now() - lastResult.checkedAt < STALE_MS) {
      return lastResult.ok ? "ok" : "redirecting";
    }
    return "checking";
  });

  useEffect(() => {
    let cancelled = false;
    if (state !== "checking") return;
    fetch(apiUrl("/api/user/data"), { credentials: "include" })
      .then((res) => {
        if (cancelled) return;
        const ok = res.ok;
        lastResult.ok = ok;
        lastResult.checkedAt = Date.now();
        if (ok) {
          setState("ok");
        } else {
          setState("redirecting");
          navigate("/signin", { replace: true });
        }
      })
      .catch(() => {
        if (cancelled) return;
        lastResult.ok = true;
        lastResult.checkedAt = Date.now();
        setState("ok");
      });
    return () => {
      cancelled = true;
    };
  }, [navigate, state]);

  return state === "ok" ? props.children : null;
}
