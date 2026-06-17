import { useState, useMemo } from "react";
import { ArrowRight, Loader2, Shield, AlertCircle, Eye, EyeOff } from "lucide-react";
import { useLocation } from "wouter";

export default function SignInPage() {
  const [, navigate] = useLocation();
  const [canvasUrl, setCanvasUrl] = useState("");
  const [pat, setPat] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "verifying" | "connected">("idle");
  const isExtensionFlow = useMemo(
    () => new URLSearchParams(window.location.search).get("from") === "extension",
    [],
  );

  const handleConnect = async () => {
    const url = canvasUrl.trim();
    const token = pat.trim();

    if (!url) { setError("Enter your Canvas URL"); return; }
    if (!url.match(/^https?:\/\/[a-z0-9-]+\.instructure\.com$/)) {
      setError("Must be a valid Canvas URL (e.g., https://school.instructure.com)");
      return;
    }
    if (!token) { setError("Enter your Canvas access token"); return; }

    setStatus("verifying");
    setError(null);

    try {
      const res = await fetch("/api/auth/canvas/pat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ canvasUrl: url, pat: token }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to connect to Canvas");
        setStatus("idle");
        return;
      }

      if (data.sessionToken) {
        try {
          localStorage.setItem("jarvis_session_token", data.sessionToken);
          const channel = new BroadcastChannel("jarvis-auth");
          channel.postMessage({ type: "auth-success", sessionToken: data.sessionToken });
          channel.close();
        } catch { /* ignore */ }

        if (isExtensionFlow && window.opener) {
          window.opener.postMessage(
            { type: "jarvis-auth-success", sessionToken: data.sessionToken },
            window.location.origin,
          );
          setStatus("connected");
          return;
        }
      }

      navigate("/dashboard");
    } catch {
      setError("Connection error — check your Canvas URL and token");
      setStatus("idle");
    }
  };

  return (
    <div className="hud-bg min-h-screen text-[#f5f5f5] font-sans flex items-center justify-center px-6">
      <div className="hud-scanline" />
      <div className="relative z-10 w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <img src="/carvis-logo.png" alt="" className="h-10 w-10 object-contain" />
          <span className="text-2xl font-bold tracking-[0.2em] text-[#FF4444]">CARVIS</span>
        </div>

        <div className="hud-panel p-8">
          <span className="corner-br" />
          <div className="text-center mb-6">
            <h1 className="font-orbitron text-lg font-bold tracking-[0.15em] text-[#FF4444] mb-2">CONNECT CANVAS</h1>
            <p className="font-rajdhani text-[13px] text-[rgba(245,245,245,0.4)]">
              Sign in with your Canvas Personal Access Token.
              CARVIS will pull your courses, assignments, and grades automatically.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="font-orbitron text-[10px] font-bold tracking-[0.15em] text-[rgba(245,245,245,0.4)] mb-2 block">CANVAS URL</label>
              <input
                type="url"
                value={canvasUrl}
                onChange={(e) => { setCanvasUrl(e.target.value); setError(null); }}
                placeholder="https://school.instructure.com"
                className="w-full px-4 py-3 bg-[#0a0000] border border-[rgba(160,21,21,0.25)] text-[#f5f5f5] font-mono text-[13px] placeholder:text-[rgba(245,245,245,0.25)] focus:border-[#FF4444]/50 focus:outline-none transition rounded-lg"
                autoFocus
              />
            </div>

            <div>
              <label className="font-orbitron text-[10px] font-bold tracking-[0.15em] text-[rgba(245,245,245,0.4)] mb-2 block">ACCESS TOKEN</label>
              <div className="relative">
                <input
                  type={showToken ? "text" : "password"}
                  value={pat}
                  onChange={(e) => { setPat(e.target.value); setError(null); }}
                  placeholder="Paste your Canvas access token"
                  className="w-full px-4 py-3 pr-10 bg-[#0a0000] border border-[rgba(160,21,21,0.25)] text-[#f5f5f5] font-mono text-[13px] placeholder:text-[rgba(245,245,245,0.25)] focus:border-[#FF4444]/50 focus:outline-none transition rounded-lg"
                  onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[rgba(245,245,245,0.4)] hover:text-[#FF4444] transition"
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
                <><Loader2 className="w-4 h-4 hud-sync-active" /><span>VERIFYING...</span></>
              ) : status === "connected" ? (
                <span>CONNECTED — RETURN TO CANVAS</span>
              ) : (
                <><span>SIGN IN WITH CANVAS</span><ArrowRight className="w-4 h-4" /></>
              )}
            </button>

            {status === "connected" && (
              <p className="font-rajdhani text-[12px] text-[#22c55e] text-center">
                CARVIS is linked. Close this tab and return to Canvas — the overlay should update automatically.
              </p>
            )}

            {error && (
              <div className="flex items-start gap-2 p-3 bg-[#FF6B3D]/10 border border-[#FF6B3D]/20 rounded-lg">
                <AlertCircle className="w-4 h-4 text-[#FF6B3D] mt-0.5 shrink-0" />
                <p className="font-rajdhani text-[12px] text-[#FF6B3D]">{error}</p>
              </div>
            )}
          </div>

          <div className="flex items-start gap-2 mt-6 pt-4 border-t border-[rgba(160,21,21,0.15)]">
            <Shield className="w-4 h-4 text-[rgba(245,245,245,0.4)] mt-0.5 shrink-0" />
            <p className="font-rajdhani text-[11px] text-[rgba(245,245,245,0.4)] leading-relaxed">
              Your token is encrypted and never shared. CARVIS only reads your Canvas data — it never modifies anything.
            </p>
          </div>
        </div>

        <div className="hud-panel p-4 mt-4">
          <p className="font-orbitron text-[10px] font-bold tracking-[0.1em] text-[rgba(245,245,245,0.4)] mb-3">HOW TO GET YOUR TOKEN</p>
          <ol className="font-rajdhani text-[11px] text-[rgba(245,245,245,0.4)] leading-relaxed space-y-2 list-decimal list-inside">
            <li>Log in to your school's Canvas</li>
            <li>Go to <span className="text-[#FF4444]">Account → Settings</span></li>
            <li>Scroll to <span className="text-[#FF4444]">Approved Integrations</span></li>
            <li>Click <span className="text-[#FF4444]">+ New Access Token</span></li>
            <li>Name it "CARVIS" and click Generate</li>
            <li>Copy the token and paste it above</li>
          </ol>
          <p className="font-rajdhani text-[10px] text-[rgba(245,245,245,0.25)] mt-3">No admin approval needed — this works with any Canvas student account.</p>
        </div>
      </div>
    </div>
  );
}
