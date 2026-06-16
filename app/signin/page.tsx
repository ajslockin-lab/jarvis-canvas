"use client";

import { useState } from "react";
import { Sparkles, ArrowRight, Loader2, Shield, AlertCircle, Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";

export default function SignInPage() {
  const router = useRouter();
  const [canvasUrl, setCanvasUrl] = useState("");
  const [pat, setPat] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "verifying">("idle");

  const handleConnect = async () => {
    const url = canvasUrl.trim();
    const token = pat.trim();

    if (!url) {
      setError("Enter your Canvas URL");
      return;
    }
    if (!url.match(/^https?:\/\/[a-z0-9-]+\.instructure\.com$/)) {
      setError("Must be a valid Canvas URL (e.g., https://school.instructure.com)");
      return;
    }
    if (!token) {
      setError("Enter your Canvas access token");
      return;
    }

    setStatus("verifying");
    setError(null);

    try {
      const res = await fetch("/api/auth/canvas/pat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canvasUrl: url, pat: token }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to connect to Canvas");
        setStatus("idle");
        return;
      }

      // Cookie is set by the server — redirect to dashboard
      router.push("/dashboard");
    } catch {
      setError("Connection error — check your Canvas URL and token");
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
              Sign in with your Canvas Personal Access Token.
              JARVIS will pull your courses, assignments, and grades automatically.
            </p>
          </div>

          <div className="space-y-4">
            {/* Canvas URL */}
            <div>
              <label className="font-orbitron text-[10px] font-bold tracking-[0.15em] text-[#5a7a8a] mb-2 block">
                CANVAS URL
              </label>
              <input
                type="url"
                value={canvasUrl}
                onChange={(e) => { setCanvasUrl(e.target.value); setError(null); }}
                placeholder="https://school.instructure.com"
                className="w-full px-4 py-3 bg-[#0A1520] border border-[#00B4FF]/20 text-[#e8f4f8] font-mono text-[13px] placeholder:text-[#5a7a8a]/50 focus:border-[#00B4FF]/50 focus:outline-none transition"
                autoFocus
              />
            </div>

            {/* Access Token */}
            <div>
              <label className="font-orbitron text-[10px] font-bold tracking-[0.15em] text-[#5a7a8a] mb-2 block">
                ACCESS TOKEN
              </label>
              <div className="relative">
                <input
                  type={showToken ? "text" : "password"}
                  value={pat}
                  onChange={(e) => { setPat(e.target.value); setError(null); }}
                  placeholder="Paste your Canvas access token"
                  className="w-full px-4 py-3 pr-10 bg-[#0A1520] border border-[#00B4FF]/20 text-[#e8f4f8] font-mono text-[13px] placeholder:text-[#5a7a8a]/50 focus:border-[#00B4FF]/50 focus:outline-none transition"
                  onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5a7a8a] hover:text-[#00E5FF] transition"
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              onClick={handleConnect}
              disabled={status !== "idle"}
              className="w-full hud-btn-primary hud-btn px-5 py-3 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === "verifying" ? (
                <>
                  <Loader2 className="w-4 h-4 hud-sync-active" />
                  <span>VERIFYING...</span>
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

        {/* How to get a token */}
        <div className="hud-panel p-4 mt-4">
          <p className="font-orbitron text-[10px] font-bold tracking-[0.1em] text-[#5a7a8a] mb-3">
            HOW TO GET YOUR TOKEN
          </p>
          <ol className="font-rajdhani text-[11px] text-[#5a7a8a] leading-relaxed space-y-2 list-decimal list-inside">
            <li>Log in to your school's Canvas</li>
            <li>Go to <span className="text-[#00B4FF]">Account → Settings</span></li>
            <li>Scroll to <span className="text-[#00B4FF]">Approved Integrations</span></li>
            <li>Click <span className="text-[#00B4FF]">+ New Access Token</span></li>
            <li>Name it "JARVIS" and click Generate</li>
            <li>Copy the token and paste it above</li>
          </ol>
          <p className="font-rajdhani text-[10px] text-[#5a7a8a]/60 mt-3">
            No admin approval needed — this works with any Canvas student account.
          </p>
        </div>
      </div>
    </div>
  );
}
