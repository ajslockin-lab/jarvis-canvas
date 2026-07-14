import { Link } from "wouter";
import { Link2, Check, ArrowRight } from "lucide-react";

interface CanvasConnectButtonProps {
  connected?: boolean;
}

export default function CanvasConnectButton({ connected }: CanvasConnectButtonProps) {
  if (connected) {
    return (
      <div className="inline-flex items-center gap-2 px-4 py-2 border border-[#00FF88]/30 bg-[#00FF88]/10 text-[#00FF88]">
        <Check className="w-4 h-4" />
        <span className="font-orbitron text-[11px] font-bold tracking-[0.1em]">CANVAS LINKED</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Link href="/onboarding/canvas"
        className="hud-btn-primary hud-btn inline-flex items-center gap-2 px-5 py-2.5">
        <Link2 className="w-4 h-4" />
        <span>CONNECT WITH ACCESS TOKEN</span>
        <ArrowRight className="w-4 h-4" />
      </Link>
      <p className="font-rajdhani text-[11px] text-[#5a7a8a]">
        Uses your Canvas Personal Access Token — no admin approval required. You can also sign in with Canvas OAuth on the next screen.
      </p>
    </div>
  );
}
