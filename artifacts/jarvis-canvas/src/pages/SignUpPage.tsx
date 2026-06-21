// SignUpPage — first step of the new account flow.
//
// Three fields: email, name, password. Submit creates the user (without a
// session — they need to verify the email first), generates a 6-digit
// code, and routes to /verify-email. In dev mode the response includes
// the plaintext code so the developer can complete the flow without SMTP.

import { useState } from "react";
import { ArrowRight, Loader2, Shield, AlertCircle, CheckCircle2 } from "lucide-react";
import { Link, useLocation } from "wouter";

type SignUpError =
  | { kind: "email_taken" }
  | { kind: "server_error"; statusCode?: number }
  | { kind: "rate_limited" }
  | { kind: "network" }
  | { kind: "validation"; message: string };

// Mirrors the server's password schema — at least 8 chars, max 200.
function clientValidate(email: string, name: string, password: string): SignUpError | null {
  if (!email) return { kind: "validation", message: "Enter your email" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { kind: "validation", message: "That doesn't look like an email" };
  if (!name.trim()) return { kind: "validation", message: "Enter your name" };
  if (password.length < 8) return { kind: "validation", message: "Password must be at least 8 characters" };
  return null;
}

export default function SignUpPage() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<SignUpError | null>(null);
  const [stage, setStage] = useState<"idle" | "creating">("idle");

  // The page deliberately does NOT auto-redirect authed users to /dashboard.
  // SignInPage does (it makes no sense to show a sign-in form to a signed-in
  // user), but SignUpPage must always show the form: a user with a stale
  // session from a previous account should be able to create a NEW account
  // here. If they happen to type an email that already has an account, the
  // `email_taken` error below handles it with a "sign in instead" link.
  //
  // The previous behavior (redirect if /api/user/data is 200) created a
  // mobile loop: LandingPage redirected mobile visitors to /signup, and
  // SignUpPage then bounced them to /dashboard before they could see the
  // form. That made the page unusable on mobile for anyone who had ever
  // signed up before.

  const handleSubmit = async () => {
    const v = clientValidate(email, name, password);
    if (v) {
      setError(v);
      return;
    }

    setError(null);
    setStage("creating");

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim(), name: name.trim(), password }),
      });

      if (res.ok) {
        const data = await res.json();
        // Forward userId (and email) to the verify page. We deliberately
        // ignore any devCode that the server might surface — that's only
        // useful in dev and the verify page no longer shows it.
        const params = new URLSearchParams();
        params.set("userId", data.userId);
        params.set("email", email.trim());
        navigate(`/verify-email?${params.toString()}`);
        return;
      }

      let data: { error?: string; code?: string } = {};
      try {
        data = await res.json();
      } catch {
        // No body — fall through.
      }
      const code = data.code ?? "";
      if (code === "email_taken") setError({ kind: "email_taken" });
      else if (code === "rate_limited") setError({ kind: "rate_limited" });
      else if (code === "bad_request") setError({ kind: "validation", message: data.error ?? "Check your input" });
      else if (code === "server_error" || res.status >= 500) setError({ kind: "server_error", statusCode: res.status });
      else setError({ kind: "server_error", statusCode: res.status });
      setStage("idle");
    } catch {
      setError({ kind: "network" });
      setStage("idle");
    }
  };

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

          <div className="text-center mb-6">
            <h1 className="font-orbitron text-lg font-bold tracking-[0.15em] text-[#FF4444] mb-2">CREATE ACCOUNT</h1>
            <p className="font-rajdhani text-[13px] text-[rgba(245,245,245,0.4)]">
              One quick step before we connect your Canvas.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="signup-name" className="font-orbitron text-[10px] font-bold tracking-[0.15em] text-[rgba(245,245,245,0.4)] mb-2 block">NAME</label>
              <input
                id="signup-name"
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); setError(null); }}
                placeholder="What should we call you?"
                className="w-full px-4 py-3 bg-[#0a0000] border border-[rgba(160,21,21,0.25)] text-[#f5f5f5] font-mono text-[13px] placeholder:text-[rgba(245,245,245,0.25)] focus:border-[#FF4444]/50 focus:outline-none transition rounded-lg"
                autoComplete="name"
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="signup-email" className="font-orbitron text-[10px] font-bold tracking-[0.15em] text-[rgba(245,245,245,0.4)] mb-2 block">EMAIL</label>
              <input
                id="signup-email"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null); }}
                placeholder="you@gmail.com"
                className="w-full px-4 py-3 bg-[#0a0000] border border-[rgba(160,21,21,0.25)] text-[#f5f5f5] font-mono text-[13px] placeholder:text-[rgba(245,245,245,0.25)] focus:border-[#FF4444]/50 focus:outline-none transition rounded-lg"
                autoComplete="email"
              />
            </div>

            <div>
              <label htmlFor="signup-password" className="font-orbitron text-[10px] font-bold tracking-[0.15em] text-[rgba(245,245,245,0.4)] mb-2 block">PASSWORD</label>
              <div className="relative">
                <input
                  id="signup-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null); }}
                  placeholder="At least 8 characters"
                  className="w-full px-4 py-3 pr-10 bg-[#0a0000] border border-[rgba(160,21,21,0.25)] text-[#f5f5f5] font-mono text-[13px] placeholder:text-[rgba(245,245,245,0.25)] focus:border-[#FF4444]/50 focus:outline-none transition rounded-lg"
                  onKeyDown={(e) => e.key === "Enter" && stage === "idle" && handleSubmit()}
                  autoComplete="new-password"
                  aria-invalid={error?.kind === "validation" ? true : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[rgba(245,245,245,0.4)] hover:text-[#FF4444] transition"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
              <p className="font-rajdhani text-[10px] text-[rgba(245,245,245,0.3)] mt-1.5">
                <span className="text-[rgba(245,245,245,0.5)]">Tip:</span> try 12+ characters — length beats complexity.
              </p>
            </div>

            <button
              onClick={handleSubmit}
              disabled={stage !== "idle"}
              className="w-full hud-btn-primary hud-btn px-5 py-3 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {stage === "idle" ? (
                <><span>CONTINUE</span><ArrowRight className="w-4 h-4" /></>
              ) : (
                <><Loader2 className="w-4 h-4 hud-sync-active" /><span>CREATING ACCOUNT…</span></>
              )}
            </button>

            {error && <ErrorBlock error={error} onRetry={() => setError(null)} />}

            <div className="pt-2 text-center">
              <span className="font-rajdhani text-[11px] text-[rgba(245,245,245,0.4)]">
                Already have an account?{" "}
                <Link href="/signin" className="text-[#FF4444] hover:underline">
                  Sign in
                </Link>
              </span>
            </div>
          </div>

          <div className="flex items-start gap-2 mt-6 pt-4 border-t border-[rgba(160,21,21,0.15)]">
            <Shield className="w-4 h-4 text-[rgba(245,245,245,0.4)] mt-0.5 shrink-0" />
            <p className="font-rajdhani text-[11px] text-[rgba(245,245,245,0.4)] leading-relaxed">
              We'll send a 6-digit code to your email to confirm it's you. No marketing, no spam.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ErrorBlock({ error, onRetry }: { error: SignUpError; onRetry: () => void }) {
  const base = "flex items-start gap-3 p-3 border rounded-lg";
  const tone = "bg-[#FF6B3D]/10 border-[#FF6B3D]/20";

  if (error.kind === "email_taken") {
    return (
      <div className={`${base} ${tone}`}>
        <AlertCircle className="w-4 h-4 text-[#FF6B3D] mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="font-rajdhani text-[12px] text-[#FF6B3D] font-semibold">An account with this email already exists</p>
          <p className="font-rajdhani text-[11px] text-[rgba(255,107,61,0.8)] mt-1">
            Try <Link href="/signin" className="underline">signing in</Link> instead, or use a different email.
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
            Wait a minute and try again.
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
            {error.statusCode ? `(status ${error.statusCode}) ` : ""}Try again — the issue is on our side.
          </p>
          <button onClick={onRetry} className="font-orbitron text-[10px] tracking-[0.1em] text-[#FF4444] mt-2 inline-flex items-center gap-1 hover:underline">
            RETRY
          </button>
        </div>
      </div>
    );
  }

  if (error.kind === "validation") {
    return (
      <div className={`${base} ${tone}`}>
        <AlertCircle className="w-4 h-4 text-[#FF6B3D] mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="font-rajdhani text-[12px] text-[#FF6B3D] font-semibold">{error.message}</p>
        </div>
      </div>
    );
  }

  // network
  return (
    <div className={`${base} ${tone}`}>
      <AlertCircle className="w-4 h-4 text-[#FF6B3D] mt-0.5 shrink-0" />
      <div className="flex-1">
        <p className="font-rajdhani text-[12px] text-[#FF6B3D] font-semibold">Connection error</p>
        <p className="font-rajdhani text-[11px] text-[rgba(255,107,61,0.8)] mt-1">
          Check your internet connection and try again.
        </p>
        <button onClick={onRetry} className="font-orbitron text-[10px] tracking-[0.1em] text-[#FF4444] mt-2 inline-flex items-center gap-1 hover:underline">
          RETRY
        </button>
      </div>
    </div>
  );
}

// Inline SVG icons — avoids an extra lucide-react import. The two states
// (Eye / EyeOff) are toggled in the parent.
function EyeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" x2="22" y1="2" y2="22" />
    </svg>
  );
}
