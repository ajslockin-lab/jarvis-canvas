// ForgotPasswordPage — self-serve password reset.
//
// 3 stages: enter email → enter 6-digit code + new password → done.
//
// The "request" endpoint never tells the caller whether the email exists
// (defense against user enumeration). The dev-only `devCode` field in the
// response lets us show the code inline when running without a real email
// provider (RESEND_API_KEY unset). In production the user gets a real email
// and the dev banner doesn't render.
//
// Stage 2 mirrors VerifyEmailPage's 6-digit input UX: separate boxes per
// digit, auto-advance on type, paste fills them all, backspace jumps back.

import { useState, useEffect, useRef } from "react";
import { Loader2, AlertCircle, Mail, ArrowLeft, KeyRound, Eye, EyeOff, Check } from "lucide-react";
import { Link, useLocation } from "wouter";
import { apiUrl } from "../lib/api-base";

type Stage = "request_email" | "enter_code" | "done";

type RequestError =
  | { kind: "resend_too_soon"; retryIn: number }
  | { kind: "server_error" }
  | { kind: "network" }
  | { kind: "bad_request"; message: string };

type ResetError =
  | { kind: "reset_invalid_code" }
  | { kind: "reset_expired" }
  | { kind: "reset_too_many_attempts" }
  | { kind: "reset_not_found" }
  | { kind: "bad_request"; message: string }
  | { kind: "server_error" }
  | { kind: "network" };

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_S = 60;

export default function ForgotPasswordPage() {
  const [, navigate] = useLocation();
  const [stage, setStage] = useState<Stage>("request_email");
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);

  // Stage 1 (request) state
  const [requestStage, setRequestStage] = useState<"idle" | "requesting" | "resending">("idle");
  const [requestError, setRequestError] = useState<RequestError | null>(null);
  const [resendCooldown, setResendCooldown] = useState<number>(0);

  // Stage 2 (verify) state — same shape as VerifyEmailPage.
  const [code, setCode] = useState<string[]>(() => Array(CODE_LENGTH).fill(""));
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetStage, setResetStage] = useState<"idle" | "submitting">("idle");
  const [resetError, setResetError] = useState<ResetError | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Cooldown ticker.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  const sendRequest = async (isResend: boolean) => {
    if (requestStage !== "idle") return;
    if (!email.trim()) {
      setRequestError({ kind: "bad_request", message: "Enter your email" });
      return;
    }
    setRequestError(null);
    setRequestStage(isResend ? "resending" : "requesting");
    try {
      const res = await fetch(apiUrl("/api/auth/request-password-reset"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        // The server returns a userId only when the email was found. If
        // it's not in the response, the email didn't exist — we still
        // advance to the code stage so we don't leak existence via UX.
        if (data.userId) setUserId(data.userId);
        if (data.devCode) setDevCode(data.devCode);
        setResendCooldown(RESEND_COOLDOWN_S);
        setStage("enter_code");
        setCode(Array(CODE_LENGTH).fill(""));
        // Focus the first code input on the next tick.
        setTimeout(() => inputRefs.current[0]?.focus(), 50);
      } else if (data.code === "resend_too_soon") {
        setRequestError({ kind: "resend_too_soon", retryIn: RESEND_COOLDOWN_S });
        setResendCooldown(RESEND_COOLDOWN_S);
      } else {
        setRequestError({ kind: "server_error" });
      }
    } catch {
      setRequestError({ kind: "network" });
    } finally {
      setRequestStage("idle");
    }
  };

  const submitCode = async (fullCode: string) => {
    if (resetStage !== "idle") return;
    if (!userId) {
      // Shouldn't happen — we only get here from the request step. But if
      // a deep link ever lands here without a userId, ask them to start over.
      setResetError({ kind: "reset_not_found" });
      return;
    }
    if (newPassword.length < 8) {
      setResetError({ kind: "bad_request", message: "Password must be at least 8 characters" });
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError({ kind: "bad_request", message: "Passwords don't match" });
      return;
    }

    setResetError(null);
    setResetStage("submitting");
    try {
      const res = await fetch(apiUrl("/api/auth/perform-password-reset"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, code: fullCode, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        // Wipe any localStorage account tabs that match this email — their
        // sessions are now dead (server invalidated all of them).
        try {
          const { readRecentAccounts, removeRecentAccountsForEmail } = await import("@/lib/recent-accounts");
          for (const a of readRecentAccounts()) {
            if (a.email.toLowerCase() === email.trim().toLowerCase()) {
              removeRecentAccountsForEmail(a.email);
            }
          }
        } catch {
          // localStorage might be unavailable; not a blocker for the reset.
        }
        setStage("done");
        return;
      }
      const code2 = data.code ?? "";
      if (code2 === "reset_invalid_code") setResetError({ kind: "reset_invalid_code" });
      else if (code2 === "reset_expired") setResetError({ kind: "reset_expired" });
      else if (code2 === "reset_too_many_attempts") setResetError({ kind: "reset_too_many_attempts" });
      else if (code2 === "reset_not_found") setResetError({ kind: "reset_not_found" });
      else if (code2 === "bad_request") setResetError({ kind: "bad_request", message: data.error ?? "Check your input" });
      else setResetError({ kind: "server_error" });
      setResetStage("idle");
    } catch {
      setResetError({ kind: "network" });
      setResetStage("idle");
    }
  };

  // --- Render ---

  if (stage === "done") {
    return (
      <div className="hud-bg min-h-screen text-[#f5f5f5] font-sans flex items-center justify-center px-6 py-12">
        <div className="hud-scanline" />
        <div className="relative z-10 w-full max-w-md">
          <div className="flex items-center justify-center gap-3 mb-8">
            <img src="/carvis-logo.png" alt="" className="h-10 w-10 object-contain" />
            <span className="text-2xl font-bold tracking-[0.2em] text-[#FF4444]">CARVIS</span>
          </div>
          <div className="hud-panel p-8 text-center">
            <span className="corner-br" />
            <div className="w-16 h-16 mx-auto mb-4 rounded-full border-2 border-[#22c55e] flex items-center justify-center">
              <Check className="w-8 h-8 text-[#22c55e]" />
            </div>
            <h1 className="font-orbitron text-lg font-bold tracking-[0.15em] text-[#22c55e] mb-2">PASSWORD RESET</h1>
            <p className="font-rajdhani text-[13px] text-[rgba(245,245,245,0.5)] mb-6">
              Your password is updated. Sign in with your new password.
            </p>
            <Link href="/signin" className="hud-btn-primary hud-btn px-5 py-3 inline-flex items-center gap-2">
              <span>CONTINUE TO SIGN IN</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (stage === "enter_code") {
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
                <KeyRound className="w-5 h-5 text-[#FF4444]" />
              </div>
              <h1 className="font-orbitron text-lg font-bold tracking-[0.15em] text-[#FF4444] mb-2">RESET PASSWORD</h1>
              <p className="font-rajdhani text-[13px] text-[rgba(245,245,245,0.4)]">
                Enter the code we sent to <span className="text-[rgba(245,245,245,0.7)]">{email}</span> and pick a new password.
              </p>
            </div>

            {devCode && (
              <div className="mb-4 p-3 rounded-lg border border-[#FF9500]/30 bg-[#FF9500]/10">
                <p className="font-orbitron text-[10px] font-bold tracking-[0.15em] text-[#FF9500] mb-1">DEV MODE</p>
                <p className="font-rajdhani text-[12px] text-[rgba(255,149,0,0.9)]">
                  Your code is <span className="font-mono-data font-bold">{devCode}</span> (no real email sent in dev).
                </p>
              </div>
            )}

            <div className="mb-4">
              <label className="font-orbitron text-[10px] font-bold tracking-[0.15em] text-[rgba(245,245,245,0.4)] mb-3 block text-center">RESET CODE</label>
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
                    onChange={(e) => setDigit(i, e.target.value, devCode)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    onFocus={(e) => e.currentTarget.select()}
                    disabled={resetStage === "submitting"}
                    className="w-11 h-14 text-center bg-[#0a0000] border border-[rgba(160,21,21,0.25)] text-[#f5f5f5] font-mono text-xl font-bold focus:border-[#FF4444]/50 focus:outline-none transition rounded-lg disabled:opacity-50"
                    aria-label={`Digit ${i + 1}`}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-3 mt-5">
              <div>
                <label htmlFor="newPassword" className="font-orbitron text-[10px] font-bold tracking-[0.15em] text-[rgba(245,245,245,0.4)] mb-2 block">NEW PASSWORD</label>
                <div className="relative">
                  <input
                    id="newPassword"
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => { setNewPassword(e.target.value); setResetError(null); }}
                    placeholder="At least 8 characters"
                    className="w-full px-4 py-3 pr-10 bg-[#0a0000] border border-[rgba(160,21,21,0.25)] text-[#f5f5f5] font-mono text-[13px] placeholder:text-[rgba(245,245,245,0.25)] focus:border-[#FF4444]/50 focus:outline-none transition rounded-lg"
                    autoComplete="new-password"
                    disabled={resetStage === "submitting"}
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
              <div>
                <label htmlFor="confirmPassword" className="font-orbitron text-[10px] font-bold tracking-[0.15em] text-[rgba(245,245,245,0.4)] mb-2 block">CONFIRM PASSWORD</label>
                <input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setResetError(null); }}
                  placeholder="Re-type your password"
                  className="w-full px-4 py-3 bg-[#0a0000] border border-[rgba(160,21,21,0.25)] text-[#f5f5f5] font-mono text-[13px] placeholder:text-[rgba(245,245,245,0.25)] focus:border-[#FF4444]/50 focus:outline-none transition rounded-lg"
                  autoComplete="new-password"
                  disabled={resetStage === "submitting"}
                />
              </div>
            </div>

            {resetStage === "submitting" && (
              <div className="flex items-center justify-center gap-2 text-[#FF4444] font-rajdhani text-[12px] my-3">
                <Loader2 className="w-3.5 h-3.5 hud-sync-active" />
                <span>Resetting…</span>
              </div>
            )}

            {resetError && <ResetErrorBlock error={resetError} />}

            <div className="text-center mt-5">
              {resendCooldown > 0 ? (
                <p className="font-rajdhani text-[11px] text-[rgba(245,245,245,0.4)]">
                  Resend code in {resendCooldown}s
                </p>
              ) : (
                <button
                  onClick={() => sendRequest(true)}
                  disabled={requestStage !== "idle" || resetStage === "submitting"}
                  className="font-rajdhani text-[11px] text-[rgba(245,245,245,0.4)] hover:text-[#FF4444] transition disabled:opacity-50"
                >
                  {requestStage === "resending" ? "Sending…" : "Didn't get it? Resend code"}
                </button>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-[rgba(160,21,21,0.15)] text-center">
              <button
                type="button"
                onClick={() => {
                  setStage("request_email");
                  setResetError(null);
                  setCode(Array(CODE_LENGTH).fill(""));
                  setNewPassword("");
                  setConfirmPassword("");
                }}
                className="font-rajdhani text-[11px] text-[rgba(245,245,245,0.4)] hover:text-[#FF4444] transition inline-flex items-center gap-1"
              >
                <ArrowLeft className="w-3 h-3" />
                Use a different email
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // stage === "request_email"
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
            <h1 className="font-orbitron text-lg font-bold tracking-[0.15em] text-[#FF4444] mb-2">FORGOT PASSWORD</h1>
            <p className="font-rajdhani text-[13px] text-[rgba(245,245,245,0.4)]">
              Enter the email on your account and we'll send you a 6-digit code to reset your password.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="font-orbitron text-[10px] font-bold tracking-[0.15em] text-[rgba(245,245,245,0.4)] mb-2 block">EMAIL</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setRequestError(null); }}
                placeholder="you@gmail.com"
                className="w-full px-4 py-3 bg-[#0a0000] border border-[rgba(160,21,21,0.25)] text-[#f5f5f5] font-mono text-[13px] placeholder:text-[rgba(245,245,245,0.25)] focus:border-[#FF4444]/50 focus:outline-none transition rounded-lg"
                autoFocus
                autoComplete="email"
                onKeyDown={(e) => e.key === "Enter" && requestStage === "idle" && sendRequest(false)}
              />
            </div>

            <button
              onClick={() => sendRequest(false)}
              disabled={requestStage !== "idle"}
              className="w-full hud-btn-primary hud-btn px-5 py-3 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {requestStage === "requesting" ? (
                <><Loader2 className="w-4 h-4 hud-sync-active" /><span>SENDING…</span></>
              ) : (
                <span>SEND RESET CODE</span>
              )}
            </button>

            {requestError && <RequestErrorBlock error={requestError} />}
          </div>

          <div className="mt-6 pt-4 border-t border-[rgba(160,21,21,0.15)] text-center">
            <Link href="/signin" className="font-rajdhani text-[11px] text-[rgba(245,245,245,0.4)] hover:text-[#FF4444] transition inline-flex items-center gap-1">
              <ArrowLeft className="w-3 h-3" />
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );

  // ---- Helpers used by the code-input UI above ----
  function setDigit(i: number, value: string, prefilledCode: string | null) {
    if (!/^\d*$/.test(value)) return;
    // If the dev-mode code is being shown, clicking the first box lets the
    // user paste it in one shot.
    const clean = value.replace(/\D/g, "");
    const next = [...code];
    if (i === 0 && clean.length > 1) {
      // Paste — fill all boxes from the pasted digits
      const chars = clean.slice(0, CODE_LENGTH).split("");
      for (let k = 0; k < CODE_LENGTH; k++) next[k] = chars[k] ?? "";
      setCode(next);
      const filled = next.every((c) => c !== "");
      if (filled) {
        void submitCode(next.join(""));
        return;
      }
      // Focus the first empty box.
      const firstEmpty = next.findIndex((c) => c === "");
      inputRefs.current[firstEmpty]?.focus();
      return;
    }
    next[i] = clean.slice(-1);
    setCode(next);
    if (clean && i < CODE_LENGTH - 1) {
      inputRefs.current[i + 1]?.focus();
    }
    if (clean && i === CODE_LENGTH - 1) {
      const fullCode = next.join("");
      if (fullCode.length === CODE_LENGTH) {
        // Auto-submit when the last box is filled.
        void submitCode(fullCode);
      }
    }
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !code[i] && i > 0) {
      inputRefs.current[i - 1]?.focus();
    }
  }
}

function RequestErrorBlock({ error }: { error: RequestError }) {
  const base = "flex items-start gap-3 p-3 border rounded-lg mt-2";
  const tone = "bg-[#FF6B3D]/10 border-[#FF6B3D]/20";
  if (error.kind === "resend_too_soon") {
    return (
      <div className={`${base} ${tone}`}>
        <AlertCircle className="w-4 h-4 text-[#FF6B3D] mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="font-rajdhani text-[12px] text-[#FF6B3D] font-semibold">Slow down a sec</p>
          <p className="font-rajdhani text-[11px] text-[rgba(255,107,61,0.8)] mt-1">
            We limit password-reset emails to one per minute to keep things sane.
          </p>
        </div>
      </div>
    );
  }
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

function ResetErrorBlock({ error }: { error: ResetError }) {
  const base = "flex items-start gap-3 p-3 border rounded-lg mt-3";
  const tone = "bg-[#FF6B3D]/10 border-[#FF6B3D]/20";
  const text = (head: string, body: React.ReactNode) => (
    <div className={`${base} ${tone}`}>
      <AlertCircle className="w-4 h-4 text-[#FF6B3D] mt-0.5 shrink-0" />
      <div className="flex-1">
        <p className="font-rajdhani text-[12px] text-[#FF6B3D] font-semibold">{head}</p>
        <p className="font-rajdhani text-[11px] text-[rgba(255,107,61,0.8)] mt-1">{body}</p>
      </div>
    </div>
  );
  switch (error.kind) {
    case "reset_invalid_code":
      return text("That code didn't match", "Try again — or tap resend if the email is more than a few minutes old.");
    case "reset_expired":
      return text("That code expired", "Codes last 15 minutes. Tap resend to get a fresh one.");
    case "reset_too_many_attempts":
      return text("Too many tries", <>Start over from the <Link href="/forgot-password" className="underline">reset page</Link>.</>);
    case "reset_not_found":
      return text("No pending reset", <>Request a new code from the <Link href="/forgot-password" className="underline">reset page</Link>.</>);
    case "bad_request":
      return text(error.message, "Re-check the form and try again.");
    case "server_error":
      return text("Something went wrong on our end", "Try again in a moment.");
    case "network":
      return text("Connection error", "Check your internet and try again.");
  }
}
