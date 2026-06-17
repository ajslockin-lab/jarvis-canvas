import { useState } from "react";
import { Link2, Check, Loader2 } from "lucide-react";

interface CanvasConnectButtonProps {
  connected?: boolean;
  onConnect?: (canvasUrl: string) => void;
}

export default function CanvasConnectButton({ connected }: CanvasConnectButtonProps) {
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [canvasUrl, setCanvasUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (connected) {
    return (
      <div className="inline-flex items-center gap-2 px-4 py-2 border border-[#00FF88]/30 bg-[#00FF88]/10 text-[#00FF88]">
        <Check className="w-4 h-4" />
        <span className="font-orbitron text-[11px] font-bold tracking-[0.1em]">CANVAS LINKED</span>
      </div>
    );
  }

  const handleConnect = async () => {
    const url = canvasUrl.trim();
    if (!url) { setError("Enter your Canvas URL"); return; }
    if (!url.match(/^https?:\/\/[a-z0-9-]+\.instructure\.com$/)) {
      setError("Must be a valid Canvas URL (e.g., https://school.instructure.com)");
      return;
    }
    setStatus("submitting");
    setError(null);
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
        setError(data.error || "Failed to connect to Canvas");
        setStatus("idle");
      }
    } catch {
      setError("Connection error — check your Canvas URL");
      setStatus("idle");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          type="url"
          value={canvasUrl}
          onChange={(e) => { setCanvasUrl(e.target.value); setError(null); }}
          placeholder="https://school.instructure.com"
          className="flex-1 px-3 py-2 bg-[#0A1520] border border-[#00B4FF]/20 text-[#e8f4f8] font-mono-data text-[12px] placeholder:text-[#5a7a8a]/50 focus:border-[#00B4FF]/50 focus:outline-none"
          onKeyDown={(e) => e.key === "Enter" && handleConnect()}
        />
        <button
          onClick={handleConnect}
          disabled={status === "submitting"}
          className="hud-btn-primary hud-btn inline-flex items-center gap-2 px-5 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === "submitting" ? (
            <><Loader2 className="w-4 h-4 hud-sync-active" /><span>LINKING...</span></>
          ) : (
            <><Link2 className="w-4 h-4" /><span>CONNECT</span></>
          )}
        </button>
      </div>
      <p className="font-rajdhani text-[11px] text-[#5a7a8a]">Enter your school's Canvas URL, then authorize JARVIS to read your data.</p>
      {error && <p className="font-rajdhani text-[12px] text-[#FF9500]">{error}</p>}
    </div>
  );
}
