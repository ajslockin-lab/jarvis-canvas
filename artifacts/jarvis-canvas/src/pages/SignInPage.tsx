// SignInPage — returning users with email + password.
//
// Split from the old "Connect Canvas" form (now in OnboardingCanvasPage).
// This is a thin, focused screen: email + password, two actions (sign in,
// create account). No 6-step token instructions, no Canvas URL field, no
// OAuth — those live in the next step of the funnel.
//
// The session is sent back as both a cookie (httpOnly) and a sessionToken
// in the body. The body field is what the extension flow uses (it can't
// share cookies with the dashboard origin). The dashboard reads the cookie
// implicitly via credentials: "include" on subsequent requests.

import { useState, useEffect } from "react";
import { ArrowRight, Loader2, Shield, AlertCircle, Eye, EyeOff, Users } from "lucide-react";
import { Link, useLocation } from "wouter";
import { apiUrl } from "../lib/api-base";
import { pushRecentAccount, readRecentAccounts, removeRecentAccount, type RecentAccount } from "@/lib/recent-accounts";

// Match the server's ErrorCodes enum in routes/auth.ts. Frontend uses these
// to pick the right user-facing copy.
type SignInError =
  | { kind: "invalid_credentials" }
  | { kind: "email_not_verified"; userId: string }
  | { kind: "server_error"; statusCode?: number }
  | { kind: "rate_limited" }
  | { kind: "network" }
  | { kind: "bad_request"; message: string };

export default function SignInPage() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<SignInError | null>(null);
  const [stage, setStage] = useState<"idle" | "signing_in" | "switching">("idle");
  const [recentAccounts, setRecentAccounts] = useState<RecentAccount[]>([]);
  // When the user clicks "Use a different account" we hide the tab row and
  // force them onto the email/password form. Reset to false on a successful
  // signin or switch.
  const [useDifferentAccount, setUseDifferentAccount] = useState(false);

  // Load recent accounts from localStorage on first render. localStorage is
  // browser-only so this has to be in an effect (not at module top level).
  useEffect(() => {
    setRecentAccounts(readRecentAccounts());
  }, []);

  // If the user is already signed in, /signin is a dead-end — push them to
  // the dashboard immediately. Cheap 200 check via /api/user/data; 401 means
  // no session and we render the form normally.
  useEffect(() => {
    let cancelled = false;
    fetch(apiUrl("/api/user/data"), { credentials: "include" })
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          navigate("/dashboard", { replace: true });
        }
      })
      .catch(() => {
        // Network blip — let the user fill out the form normally.
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  // OAuth callback errors arrive as ?error=... query params. We just show a
  // generic notice — the user was redirected away from Canvas, they don't
  // need a deep technical reason.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("error")) {
      setError({ kind: "bad_request", message: params.get("error") || "Sign-in failed" });
      const clean = new URL(window.location.href);
      clean.searchParams.delete("error");
      window.history.replaceState({}, "", clean.toString());
    }
  }, []);

  const handleSignIn = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError({ kind: "bad_request", message: "Enter your email" });
      return;
    }
    if (!password) {
      setError({ kind: "bad_request", message: "Enter your password" });
      return;
    }

    setError(null);
    setStage("signing_in");

    try {
      const res = await fetch(apiUrl("/api/auth/signin"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: trimmedEmail, password }),
      });

      if (res.ok) {
        const data = await res.json();
        // Mirror the session to localStorage so the switch-account tab on
        // /signin can use it later. The cookie is the source of truth for
        // the current tab — localStorage is just for the *next* signin.
        if (data.user && data.sessionToken) {
          pushRecentAccount({
            userId: data.user.id,
            email: data.user.email,
            name: data.user.name ?? data.user.email,
            sessionToken: data.sessionToken,
            lastSeenAt: Date.now(),
          });
        }
        // The session cookie set by the server is the source of truth. We
        // deliberately do NOT mirror data.sessionToken to localStorage here
        // — see ExtensionOverlay.tsx for the one exception.
        navigate("/dashboard", { replace: true });
        return;
      }

      // The server returns { error, code } on every error path. Use `code`
      // (machine-readable) to pick the right kind; the `error` field is for
      // human display only.
      let data: { error?: string; code?: string; userId?: string } = {};
      try {
        data = await res.json();
      } catch {
        // No body — fall through to network error.
      }
      const code = data.code ?? "";
      if (code === "invalid_credentials") setError({ kind: "invalid_credentials" });
      else if (code === "email_not_verified") {
        // Forward them to verify-email with the userId so the page can
        // auto-resend or just accept the code from their last email.
        navigate(`/verify-email?userId=${encodeURIComponent(data.userId ?? "")}&from=signin`, { replace: true });
        return;
      } else if (code === "rate_limited") setError({ kind: "rate_limited" });
      else if (code === "server_error" || res.status >= 500) setError({ kind: "server_error", statusCode: res.status });
      else if (code === "bad_request") setError({ kind: "bad_request", message: data.error ?? "Check your input" });
      else if (code === "network") setError({ kind: "network" });
      else setError({ kind: "server_error", statusCode: res.status });
      setStage("idle");
    } catch {
      // Real fetch failure (offline, DNS, CORS preflight) — this is the only
      // path that warrants the "school firewall" copy.
      setError({ kind: "network" });
      setStage("idle");
    }
  };

  // One-tap sign-in for a previously-signed-in account. The server validates
  // the localStorage sessionToken, and on success re-issues the cookie so the
  // dashboard's next request is authenticated. We refresh the tab's
  // lastSeenAt so it sorts to the front of the list.
  const handleSwitchAccount = async (account: RecentAccount) => {
    if (stage !== "idle") return;
    setError(null);
    setStage("switching");
    try {
      const res = await fetch(apiUrl("/api/auth/switch-account"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId: account.userId, sessionToken: account.sessionToken }),
      });
      if (res.ok) {
        const data = await res.json();
        const refreshed: RecentAccount = {
          userId: account.userId,
          email: account.email,
          name: account.name,
          sessionToken: data.sessionToken ?? account.sessionToken,
          lastSeenAt: Date.now(),
        };
        pushRecentAccount(refreshed);
        setRecentAccounts(readRecentAccounts());
        navigate("/dashboard", { replace: true });
        return;
      }
      // The session on this device is gone (expired, or the user was
      // hard-deleted). Drop the tab so the next render doesn't keep showing
      // a dead button, and tell the user why.
      removeRecentAccount(account.userId);
      setRecentAccounts(readRecentAccounts());
      setError({ kind: "bad_request", message: "That account is no longer signed in on this device — sign in with your password." });
    } catch {
      setError({ kind: "network" });
    } finally {
      setStage("idle");
    }
  };

  const showTabs = recentAccounts.length > 0 && !useDifferentAccount;
  const stageLabel = stage === "idle" ? "SIGN IN" : stage === "switching" ? "SWITCHING…" : "SIGNING IN…";

  return (
    <div className="hud-bg min-h-screen text-[#f5f5f5] font-sans flex items-center justify-center px-6 py-12">
      <div className="hud-scanline" />
      <div className="relative z-10 w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <img src="/carvis-logo.png" alt="" className="h-10 w-10 object-contain" />
          <span className="text-2xl font-bold tracking-[0.2em] text-[#FF4444]">CARVIS</span>
        </div>

        <div className="hud-panel p-8">
          <span className="corner-br" />

          {showTabs && (
            <RecentAccountTabs
              accounts={recentAccounts}
              busy={stage === "switching"}
              onSwitch={handleSwitchAccount}
              onUseDifferent={() => {
                setUseDifferentAccount(true);
                setError(null);
              }}
            />
          )}

          <div className="text-center mb-6">
            <h1 className="font-orbitron text-lg font-bold tracking-[0.15em] text-[#FF4444] mb-2">WELCOME BACK</h1>
            <p className="font-rajdhani text-[13px] text-[rgba(245,245,245,0.4)]">
              Sign in to your Carvis account.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="font-orbitron text-[10px] font-bold tracking-[0.15em] text-[rgba(245,245,245,0.4)] mb-2 block">EMAIL</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null); }}
                placeholder="you@gmail.com"
                className="w-full px-4 py-3 bg-[#0a0000] border border-[rgba(160,21,21,0.25)] text-[#f5f5f5] font-mono text-[13px] placeholder:text-[rgba(245,245,245,0.25)] focus:border-[#FF4444]/50 focus:outline-none transition rounded-lg"
                autoFocus
                autoComplete="email"
                aria-invalid={error?.kind === "invalid_credentials" ? true : undefined}
              />
            </div>

            <div>
              <label htmlFor="password" className="font-orbitron text-[10px] font-bold tracking-[0.15em] text-[rgba(245,245,245,0.4)] mb-2 block">PASSWORD</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null); }}
                  placeholder="Your password"
                  className="w-full px-4 py-3 pr-10 bg-[#0a0000] border border-[rgba(160,21,21,0.25)] text-[#f5f5f5] font-mono text-[13px] placeholder:text-[rgba(245,245,245,0.25)] focus:border-[#FF4444]/50 focus:outline-none transition rounded-lg"
                  onKeyDown={(e) => e.key === "Enter" && stage === "idle" && handleSignIn()}
                  autoComplete="current-password"
                  aria-invalid={error?.kind === "invalid_credentials" ? true : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[rgba(245,245,245,0.4)] hover:text-[#FF4444] transition"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              onClick={handleSignIn}
              disabled={stage !== "idle"}
              className="w-full hud-btn-primary hud-btn px-5 py-3 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {stage === "idle" ? (
                <><span>{stageLabel}</span><ArrowRight className="w-4 h-4" /></>
              ) : (
                <><Loader2 className="w-4 h-4 hud-sync-active" /><span>{stageLabel}</span></>
              )}
            </button>

            {error && <ErrorBlock error={error} onRetry={() => setError(null)} />}

            <div className="flex items-center justify-between pt-2">
              <Link href="/forgot-password" className="font-rajdhani text-[11px] text-[rgba(245,245,245,0.4)] hover:text-[#FF4444] transition">
                Forgot password?
              </Link>
              <Link href="/signup" className="font-rajdhani text-[11px] text-[rgba(245,245,245,0.4)] hover:text-[#FF4444] transition">
                Create account →
              </Link>
            </div>
            {useDifferentAccount && recentAccounts.length > 0 && (
              <button
                type="button"
                onClick={() => setUseDifferentAccount(false)}
                className="w-full font-rajdhani text-[11px] text-[rgba(245,245,245,0.4)] hover:text-[#FF4444] transition mt-2 inline-flex items-center justify-center gap-1"
              >
                <Users className="w-3 h-3" /> Use a saved account
              </button>
            )}
          </div>

          <div className="flex items-start gap-2 mt-6 pt-4 border-t border-[rgba(160,21,21,0.15)]">
            <Shield className="w-4 h-4 text-[rgba(245,245,245,0.4)] mt-0.5 shrink-0" />
            <p className="font-rajdhani text-[11px] text-[rgba(245,245,245,0.4)] leading-relaxed">
              Your password is bcrypt-hashed at rest. We never see it in plaintext and never share it.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ErrorBlock({ error, onRetry }: { error: SignInError; onRetry: () => void }) {
  const base = "flex items-start gap-3 p-3 border rounded-lg";
  const tone = "bg-[#FF6B3D]/10 border-[#FF6B3D]/20";

  if (error.kind === "invalid_credentials") {
    return (
      <div className={`${base} ${tone}`}>
        <AlertCircle className="w-4 h-4 text-[#FF6B3D] mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="font-rajdhani text-[12px] text-[#FF6B3D] font-semibold">Invalid email or password</p>
          <p className="font-rajdhani text-[11px] text-[rgba(255,107,61,0.8)] mt-1">
            Double-check the email and password. If you just signed up, check your inbox for a verification code.
          </p>
        </div>
      </div>
    );
  }

  if (error.kind === "rate_limited") {
    return (
      <div className={`${base} ${tone}`}>
        <AlertCircle className="w-4 h-4 text-[#FF6B3D] mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="font-rajdhani text-[12px] text-[#FF6B3D] font-semibold">Too many attempts</p>
          <p className="font-rajdhani text-[11px] text-[rgba(255,107,61,0.8)] mt-1">
            Wait a minute and try again. We rate-limit sign-in attempts to keep accounts safe.
          </p>
        </div>
      </div>
    );
  }

  if (error.kind === "server_error") {
    return (
      <div className={`${base} ${tone}`}>
        <AlertCircle className="w-4 h-4 text-[#FF6B3D] mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="font-rajdhani text-[12px] text-[#FF6B3D] font-semibold">Something went wrong on our end</p>
          <p className="font-rajdhani text-[11px] text-[rgba(255,107,61,0.8)] mt-1">
            {error.statusCode ? `(status ${error.statusCode}) ` : ""}Try again in a moment. If it keeps happening, the issue is on our side.
          </p>
          <button onClick={onRetry} className="font-orbitron text-[10px] tracking-[0.1em] text-[#FF4444] mt-2 inline-flex items-center gap-1 hover:underline">
            RETRY
          </button>
        </div>
      </div>
    );
  }

  if (error.kind === "bad_request") {
    return (
      <div className={`${base} ${tone}`}>
        <AlertCircle className="w-4 h-4 text-[#FF6B3D] mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="font-rajdhani text-[12px] text-[#FF6B3D] font-semibold">{error.message}</p>
        </div>
      </div>
    );
  }

  // network — only fires when fetch() itself threw. Don't reach here for any
  // server-side error. (See handleSignIn's catch block.)
  return (
    <div className={`${base} ${tone}`}>
      <AlertCircle className="w-4 h-4 text-[#FF6B3D] mt-0.5 shrink-0" />
      <div className="flex-1">
        <p className="font-rajdhani text-[12px] text-[#FF6B3D] font-semibold">Connection error</p>
        <p className="font-rajdhani text-[11px] text-[rgba(255,107,61,0.8)] mt-1">
          Check your internet connection and try again. If the issue persists, CARVIS may be blocked by a school firewall.
        </p>
        <button onClick={onRetry} className="font-orbitron text-[10px] tracking-[0.1em] text-[#FF4444] mt-2 inline-flex items-center gap-1 hover:underline">
          RETRY
        </button>
      </div>
    </div>
  );
}

// RecentAccountTabs — row of clickable account tabs above the form.
// Shows up to 3 previously-signed-in accounts. Clicking one signs the user
// straight back in (no password re-entry). The "Use a different account"
// link collapses the tab row and shows the email/password form.
function RecentAccountTabs({
  accounts,
  busy,
  onSwitch,
  onUseDifferent,
}: {
  accounts: RecentAccount[];
  busy: boolean;
  onSwitch: (a: RecentAccount) => void;
  onUseDifferent: () => void;
}) {
  return (
    <div className="mb-6 -mx-2">
      <div className="flex items-center justify-between mb-3 px-2">
        <span className="font-orbitron text-[10px] font-bold tracking-[0.2em] text-[rgba(245,245,245,0.4)]">SAVED ACCOUNTS</span>
        <button
          type="button"
          onClick={onUseDifferent}
          className="font-rajdhani text-[11px] text-[rgba(245,245,245,0.4)] hover:text-[#FF4444] transition"
        >
          Use a different account
        </button>
      </div>
      <div className="flex gap-2 overflow-x-auto px-2 pb-1">
        {accounts.map((a) => (
          <button
            key={a.userId}
            type="button"
            disabled={busy}
            onClick={() => onSwitch(a)}
            className="group flex-1 min-w-[110px] flex flex-col items-center gap-2 p-3 rounded-lg border border-[rgba(160,21,21,0.25)] bg-[#0a0000] hover:border-[#FF4444]/60 hover:bg-[#FF4444]/5 transition disabled:opacity-50"
            aria-label={`Sign in as ${a.name}`}
          >
            <div className="w-10 h-10 rounded-full border border-[#FF4444]/40 bg-[#FF4444]/10 flex items-center justify-center font-orbitron text-sm font-bold text-[#FF4444]">
              {a.name.trim().charAt(0).toUpperCase() || "?"}
            </div>
            <div className="text-center w-full overflow-hidden">
              <p className="font-rajdhani text-[12px] text-[#f5f5f5] truncate" title={a.name}>{a.name}</p>
              <p className="font-mono-data text-[10px] text-[rgba(245,245,245,0.4)] truncate" title={a.email}>{a.email}</p>
            </div>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-4 px-2">
        <div className="flex-1 h-px bg-[rgba(160,21,21,0.15)]" />
        <span className="font-orbitron text-[9px] tracking-[0.2em] text-[rgba(245,245,245,0.3)]">OR SIGN IN WITH PASSWORD</span>
        <div className="flex-1 h-px bg-[rgba(160,21,21,0.15)]" />
      </div>
    </div>
  );
}
