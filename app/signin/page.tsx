"use client";

import { useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Sparkles, ArrowRight, Loader2, Shield, AlertCircle } from "lucide-react";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_client: "Canvas doesn't recognize this app. Your school admin needs to register JARVIS in Canvas first.",
  access_denied: "You denied access to JARVIS. Try again if you want to connect.",
  token_exchange_failed: "Couldn't get your Canvas token. Try again.",
  oauth_state_mismatch: "Security check failed. Try again.",
  canvas_auth_failed: "Canvas connection failed. Check your Canvas URL and try again.",
};

export default function SignInPage() {
  const searchParams = useSearchParams();
  const [canvasUrl, setCanvasUrl] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting">("idle");

  // Derive OAuth error from URL params — no setState in effect needed
  const oauthError = useMemo(() => {
    const err = searchParams.get("error");
    if (!err) return null;
    return ERROR_MESSAGES[err] || decodeURIComponent(err);
  }, [searchParams]);

  const error = oauthError || inputError;

  const handleConnect = async () => {
    const url = canvasUrl.trim();
    if (!url) {
      setInputError("Enter your Canvas URL");
      return;
    }

    if (!url.match(/^https?:\/\/[a-z0-9-]+\.instructure\.com$/)) {
      setInputError("Must be a valid Canvas URL (e.g., https://school.instructure.com)");
      return;
    }

    setStatus("submitting");
    setInputError(null);

    try {
      const res = await fetch("/api/auth/canvas/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canvasUrl: url }),
      });

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setInputError(data.error || "Failed to connect to Canvas");
        setStatus("idle");
      }
    } catch {
      setInputError("Connection error — check your Canvas URL");
      setStatus("idle");
    }
  };

  return (
    <div className="hud-bg min-h-screen text-[#e8f4f8] font-sans flex items-center justify-center px-6">
      <div className="hud-scanline" />
      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
            JARVIS
          </span>
        </div>

        {/* Card */}
        <div className="hud-panel p-8">
          <span className="corner-br" />
          <div className="text-center mb-6">
            <h1 className="font-orbitron text-lg font-bold tracking-[0.15em] text-[#00E5FF] mb-2">
              CONNECT CANVAS
            </h1>
            <p className="font-rajdhani text-[13px] text-[#5a7a8a]">
              Sign in by connecting your school's Canvas account. JARVIS will pull your courses,
              assignments, and grades automatically.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="font-orbitron text-[10px] font-bold tracking-[0.15em] text-[#5a7a8a] mb-2 block">
                CANVAS URL
              </label>
              <input
                type="url"
                value={canvasUrl}
                onChange={(e) => {
                  setCanvasUrl(e.target.value);
                  setInputError(null);
                }}
                placeholder="https://school.instructure.com"
                className="w-full px-4 py-3 bg-[#0A1520] border border-[#00B4FF]/20 text-[#e8f4f8] font-mono text-[13px] placeholder:text-[#5a7a8a]/50 focus:border-[#00B4FF]/50 focus:outline-none transition"
                onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                autoFocus
              />
            </div>

            <button
              onClick={handleConnect}
              disabled={status === "submitting"}
              className="w-full hud-btn-primary hud-btn px-5 py-3 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === "submitting" ? (
                <>
                  <Loader2 className="w-4 h-4 hud-sync-active" />
                  <span>CONNECTING...</span>
                </>
              ) : (
                <>
                  <span>SIGN IN WITH CANVAS</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            {error && (
              <div className="flex items-start gap-2 p-3 bg-[#FF9500]/10 border border-[#FF9500]/20">
                <AlertCircle className="w-4 h-4 text-[#FF9500] mt-0.5 shrink-0" />
                <p className="font-rajdhani text-[12px] text-[#FF9500]">{error}</p>
              </div>
            )}
          </div>

          {/* Security note */}
          <div className="flex items-start gap-2 mt-6 pt-4 border-t border-[#00B4FF]/10">
            <Shield className="w-4 h-4 text-[#5a7a8a] mt-0.5 shrink-0" />
            <p className="font-rajdhani text-[11px] text-[#5a7a8a] leading-relaxed">
              Your token is encrypted and never shared. JARVIS only reads your Canvas data — it
              never modifies anything.
            </p>
          </div>
        </div>

        {/* Setup note for first-time users */}
        <div className="hud-panel p-4 mt-4">
          <p className="font-orbitron text-[10px] font-bold tracking-[0.1em] text-[#5a7a8a] mb-2">
            FIRST TIME?
          </p>
          <p className="font-rajdhani text-[11px] text-[#5a7a8a] leading-relaxed">
            Your school's Canvas admin needs to register JARVIS as an OAuth app in Canvas.
            Go to <span className="text-[#00B4FF]">Canvas Settings → API Developer Keys</span> and
            create a key with the redirect URI:{" "}
            <span className="font-mono text-[#00E5FF]">[your-app-url]/api/auth/canvas</span>
          </p>
        </div>
      </div>
    </div>
  );
}
