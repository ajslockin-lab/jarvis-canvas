"use client";

import { useState } from "react";
import { Link2, Check, Loader2 } from "lucide-react";

export default function CanvasConnectButton() {
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");

  const handleConnect = async () => {
    setStatus("connecting");
    setTimeout(() => {
      setStatus("connected");
    }, 1500);
  };

  if (status === "connected") {
    return (
      <div className="inline-flex items-center gap-2 px-4 py-2 border border-[#00FF88]/30 bg-[#00FF88]/10 text-[#00FF88]">
        <Check className="w-4 h-4" />
        <span className="font-orbitron text-[11px] font-bold tracking-[0.1em]">CANVAS LINKED</span>
      </div>
    );
  }

  return (
    <button
      onClick={handleConnect}
      disabled={status === "connecting"}
      className="hud-btn-primary hud-btn inline-flex items-center gap-2 px-5 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {status === "connecting" ? (
        <>
          <Loader2 className="w-4 h-4 hud-sync-active" />
          <span>LINKING...</span>
        </>
      ) : (
        <>
          <Link2 className="w-4 h-4" />
          <span>LINK CANVAS</span>
        </>
      )}
    </button>
  );
}
