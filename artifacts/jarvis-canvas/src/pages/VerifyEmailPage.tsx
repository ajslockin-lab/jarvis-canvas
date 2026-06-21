// VerifyEmailPage — second step of the signup flow.
//
// Reads `userId` (and optionally `email` + `devCode`) from URL params.
// 6-digit code input with auto-advance + paste support. On success, the
// server returns a sessionToken + user. We persist the token to
// localStorage (for extension flows) and the cookie handles the dashboard
// redirect.
//
// Resend flow: 60s cooldown enforced server-side; we mirror it client-side
// to avoid round-trips.

import { useState, useEffect, useRef, useCallback } from "react";
import { Loader2, AlertCircle, Mail, ArrowLeft } from "lucide-react";
import { Link, useLocation } from "wouter";

type VerifyError =
  | { kind: "invalid_code" }
  | { kind: "code_expired" }
  | { kind: "too_many_attempts" }
  | { kind: "no_pending_verification" }
  | { kind: "resend_too_soon"; retryIn: number }
  | { kind: "server_error" }
  | { kind: "network" };

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_S = 60;

export default function VerifyEmailPage() {
  const [, navigate] = useLocation();
  const [userId, setUserId] = useState<string>("");
  const [emailHint, setEmailHint] = useState<string>("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [code, setCode] = useState<string[]>(() => Array(CODE_LENGTH).fill(""));
  const [stage, setStage] = useState<"idle" | "verifying" | "resending" | "done">("idle");
  const [error, setError] = useState<VerifyError | null>(null);
  const [resendCooldown, setResendCooldown] = useState<number>(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Read URL params on mount. If userId is missing, bounce to /signup.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const u = params.get("userId") ?? "";
    if (!u) {
      navigate("/signup", { replace: true });
      return;
    }
    setUserId(u);
    setEmailHint(params.get("email") ?? "");
    const dc = params.get("devCode");
    if (dc) setDevCode(dc);
  }, [navigate]);

  // Cooldown ticker.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => {
      setResendCooldown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  // Auto-submit when all 6 digits entered.
  const submitCode = useCallback(async (fullCode: string) => {
    setStage("verifying");
    setError(null);
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId, code: fullCode }),
      });

      if (res.ok) {
        const data = await res.json();
        try {
          localStorage.setItem("jarvis_session_token", data.sessionToken);
        } catch { /* ignore */ }
        setStage("done");
        // Brief success state, then route. If the user already connected
        // Canvas via another flow (rare but possible), go to /dashboard.
        // Otherwise step them into the Canvas connect.
        setTimeout(() => {
          navigate(data.user?.canvasBaseUrl ? "/dashboard" : "/onboarding/canvas", { replace: true });
        }, 600);
        return;
      }

      let data: { error?: string; code?: string } = {};
      try { data = await res.json(); } catch { /* no body */ }
      const code = data.code ?? "";
      if (code === "invalid_code") setError({ kind: "invalid_code" });
      else if (code === "code_expired") setError({ kind: "code_expired" });
      else if (code === "too_many_attempts") setError({ kind: "too_many_attempts" });
      else if (code === "no_pending_verification") setError({ kind: "no_pending_verification" });
      else if (code === "server_error" || res.status >= 500) setError({ kind: "server_error" });
      else setError({ kind: "server_error" });
      setCode(Array(CODE_LENGTH).fill(""));
      inputRefs.current[0]?.focus();
      setStage("idle");
    } catch {
      setError({ kind: "network" });
      setStage("idle");
    }
  }, [userId, navigate]);

  // Update a single digit slot and trigger auto-submit when full.
  const setDigit = (i: number, value: string) => {
    // Allow paste of full code: detect when value is longer than 1 char and
    // contains only digits.
    if (value.length > 1) {
      const digits = value.replace(/\D/g, "").split("").slice(0, CODE_LENGTH);
      const next = Array(CODE_LENGTH).fill("");
      digits.forEach((d, idx) => { next[idx] = d; });
      setCode(next);
      const lastFilled = Math.min(digits.length, CODE_LENGTH) - 1;
      inputRefs.current[Math.min(lastFilled + 1, CODE_LENGTH - 1)]?.focus();
      if (digits.length === CODE_LENGTH) {
        void submitCode(digits.join(""));
      }
      return;
    }

    const digit = value.replace(/\D/g, "").slice(0, 1);
    setCode((prev) => {
      const next = [...prev];
      next[i] = digit;
      return next;
    });
    if (digit && i < CODE_LENGTH - 1) {
      inputRefs.current[i + 1]?.focus();
    }
    if (digit && i === CODE_LENGTH - 1) {
      const fullCode = [...code.slice(0, CODE_LENGTH - 1), digit].join("");
      if (fullCode.length === CODE_LENGTH) {
        void submitCode(fullCode);
      }
    }
  };

  // Handle backspace: clear current, jump to previous.
  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !code[i] && i > 0) {
      inputRefs.current[i - 1]?.focus();
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || stage === "resending") return;
    setStage("resending");
    setError(null);
    try {
      const res = await fetch("/api/auth/resend-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.devCode) setDevCode(data.devCode);
        setResendCooldown(RESEND_COOLDOWN_S);
        // Clear the existing code so the user knows the old one is dead.
        setCode(Array(CODE_LENGTH).fill(""));
        inputRefs.current[0]?.focus();
      } else if (data.code === "resend_too_soon") {
        setError({ kind: "resend_too_soon", retryIn: RESEND_COOLDOWN_S });
        setResendCooldown(RESEND_COOLDOWN_S);
      } else {
        setError({ kind: "server_error" });
      }
    } catch {
      setError({ kind: "network" });
    } finally {
      setStage("idle");
    }
  };

  if (stage === "done") {
    return (
      <div className="hud-bg min-h-screen text-[#f5f5f5] font-sans flex items-center justify-center px-6">
        <div className="hud-scanline" />
        <div className="relative z-10 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full border-2 border-[#22c55e] flex items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 className="font-orbitron text-lg font-bold tracking-[0.15em] text-[#22c55e] mb-2">VERIFIED</h1>
          <p className="font-rajdhani text-[13px] text-[rgba(245,245,245,0.5)]">Taking you to the next step…</p>
        </div>
      </div>
    );
  }

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
            <div className="w-12 h-12 mx-auto mb-3 rounded-full border border-[#FF4444]/40 bg-[#FF4444]/10 flex items-center justify-center">
              <Mail className="w-5 h-5 text-[#FF4444]" />
            </div>
            <h1 className="font-orbitron text-lg font-bold tracking-[0.15em] text-[#FF4444] mb-2">CHECK YOUR EMAIL</h1>
            <p className="font-rajdhani text-[13px] text-[rgba(245,245,245,0.4)]">
              We sent a 6-digit code to{" "}
              <span className="text-[rgba(245,245,245,0.7)]">{emailHint || "your inbox"}</span>.
            </p>
          </div>

          {devCode && (
            <div className="mb-5 p-3 border border-[#00B4FF]/30 bg-[#00B4FF]/10 rounded-lg">
              <p className="font-orbitron text-[10px] font-bold tracking-[0.15em] text-[#00B4FF] mb-1">DEV MODE</p>
              <p className="font-rajdhani text-[11px] text-[rgba(0,180,255,0.8)]">
                Your code is{" "}
                <span className="font-mono text-[#00B4FF] font-bold tracking-[0.3em]">{devCode}</span>.
                In production this is emailed.
              </p>
            </div>
          )}

          <div className="mb-4">
            <label className="font-orbitron text-[10px] font-bold tracking-[0.15em] text-[rgba(245,245,245,0.4)] mb-3 block text-center">VERIFICATION CODE</label>
            <div className="flex justify-center gap-2">
              {code.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { inputRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={i === 0 ? CODE_LENGTH : 1}
                  value={digit}
                  onChange={(e) => setDigit(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  onFocus={(e) => e.currentTarget.select()}
                  disabled={stage === "verifying"}
                  className="w-11 h-14 text-center bg-[#0a0000] border border-[rgba(160,21,21,0.25)] text-[#f5f5f5] font-mono text-xl font-bold focus:border-[#FF4444]/50 focus:outline-none transition rounded-lg disabled:opacity-50"
                  aria-label={`Digit ${i + 1}`}
                />
              ))}
            </div>
          </div>

          {stage === "verifying" && (
            <div className="flex items-center justify-center gap-2 text-[#FF4444] font-rajdhani text-[12px] mb-3">
              <Loader2 className="w-3.5 h-3.5 hud-sync-active" />
              <span>Verifying…</span>
            </div>
          )}

          {error && <ErrorBlock error={error} />}

          <div className="text-center mt-5">
            {resendCooldown > 0 ? (
              <p className="font-rajdhani text-[11px] text-[rgba(245,245,245,0.4)]">
                Resend code in {resendCooldown}s
              </p>
            ) : (
              <button
                onClick={handleResend}
                disabled={stage === "resending" || stage === "verifying"}
                className="font-rajdhani text-[11px] text-[rgba(245,245,245,0.4)] hover:text-[#FF4444] transition disabled:opacity-50"
              >
                {stage === "resending" ? "Sending…" : "Didn't get it? Resend code"}
              </button>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-[rgba(160,21,21,0.15)] text-center">
            <Link href="/signup" className="font-rajdhani text-[11px] text-[rgba(245,245,245,0.4)] hover:text-[#FF4444] transition inline-flex items-center gap-1">
              <ArrowLeft className="w-3 h-3" />
              Use a different email
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function ErrorBlock({ error }: { error: VerifyError }) {
  const base = "flex items-start gap-3 p-3 border rounded-lg mt-3";
  const tone = "bg-[#FF6B3D]/10 border-[#FF6B3D]/20";

  if (error.kind === "invalid_code") {
    return (
      <div className={`${base} ${tone}`}>
        <AlertCircle className="w-4 h-4 text-[#FF6B3D] mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="font-rajdhani text-[12px] text-[#FF6B3D] font-semibold">That code didn't match</p>
          <p className="font-rajdhani text-[11px] text-[rgba(255,107,61,0.8)] mt-1">
            Try again — or tap resend if the email is more than a few minutes old.
          </p>
        </div>
      </div>
    );
  }
  if (error.kind === "code_expired") {
    return (
      <div className={`${base} ${tone}`}>
        <AlertCircle className="w-4 h-4 text-[#FF6B3D] mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="font-rajdhani text-[12px] text-[#FF6B3D] font-semibold">That code expired</p>
          <p className="font-rajdhani text-[11px] text-[rgba(255,107,61,0.8)] mt-1">
            Codes last 15 minutes. Tap resend to get a fresh one.
          </p>
        </div>
      </div>
    );
  }
  if (error.kind === "too_many_attempts") {
    return (
      <div className={`${base} ${tone}`}>
        <AlertCircle className="w-4 h-4 text-[#FF6B3D] mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="font-rajdhani text-[12px] text-[#FF6B3D] font-semibold">Too many tries</p>
          <p className="font-rajdhani text-[11px] text-[rgba(255,107,61,0.8)] mt-1">
            <Link href="/signup" className="underline">Start over</Link> with a new signup.
          </p>
        </div>
      </div>
    );
  }
  if (error.kind === "no_pending_verification") {
    return (
      <div className={`${base} ${tone}`}>
        <AlertCircle className="w-4 h-4 text-[#FF6B3D] mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="font-rajdhani text-[12px] text-[#FF6B3D] font-semibold">No pending verification</p>
          <p className="font-rajdhani text-[11px] text-[rgba(255,107,61,0.8)] mt-1">
            <Link href="/signup" className="underline">Sign up</Link> again — your previous attempt is gone.
          </p>
        </div>
      </div>
    );
  }
  if (error.kind === "resend_too_soon") {
    return (
      <div className={`${base} ${tone}`}>
        <AlertCircle className="w-4 h-4 text-[#FF6B3D] mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="font-rajdhani text-[12px] text-[#FF6B3D] font-semibold">Slow down a sec</p>
          <p className="font-rajdhani text-[11px] text-[rgba(255,107,61,0.8)] mt-1">
            We limit resends to one per minute to keep things sane.
          </p>
        </div>
      </div>
    );
  }
  // server_error / network
  return (
    <div className={`${base} ${tone}`}>
      <AlertCircle className="w-4 h-4 text-[#FF6B3D] mt-0.5 shrink-0" />
      <div className="flex-1">
        <p className="font-rajdhani text-[12px] text-[#FF6B3D] font-semibold">
          {error.kind === "network" ? "Connection error" : "Something went wrong on our end"}
        </p>
        <p className="font-rajdhani text-[11px] text-[rgba(255,107,61,0.8)] mt-1">
          {error.kind === "network"
            ? "Check your internet and try again."
            : "Try again in a moment."}
        </p>
      </div>
    </div>
  );
}
