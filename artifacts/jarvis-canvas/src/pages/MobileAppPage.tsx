import { Check, Download, Smartphone, Mic, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { usePWAInstall } from "@/hooks/use-pwa-install";

/* Mobile PWA page — split out from the landing page so the landing
   stays focused. Public (anyone can add-to-home-screen). The in-app
   install prompt comes from the same usePWAInstall hook the nav uses. */
export default function MobileAppPage() {
  const { isInstallable, isInstalled, promptInstall } = usePWAInstall();

  return (
    <div className="hud-bg min-h-screen text-[#f5f5f5] font-sans">
      <div className="hud-scanline" />

      {/* Header */}
      <div className="border-b border-[rgba(160,21,21,0.15)] bg-black/40 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <img src="/carvis-logo.png" alt="" className="h-7 w-7 object-contain" />
            <span className="text-base font-bold tracking-[0.2em] text-[#FF4444]">CARVIS</span>
          </Link>
          <Link href="/signin" className="text-sm font-medium text-white bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg transition border border-white/10">
            Sign In <ArrowRight className="w-4 h-4 inline" />
          </Link>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-16">
        {/* Hero */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#FF4444]/10 border border-[#FF4444]/20 text-[#FF4444] text-sm font-medium mb-6">
            <Smartphone className="w-4 h-4" /> Mobile PWA
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white mb-4">
            CARVIS in Your <span className="text-[#FF6B3D]">Pocket</span>
          </h1>
          <p className="text-slate-400 max-w-xl mx-auto leading-relaxed">
            Install CARVIS directly on your phone or tablet — voice commands, deadline alerts, and grades on the go.
            Works as a PWA: add it to your home screen for a full-screen, offline-capable mobile experience.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-10 items-center">
          <div>
            <ul className="space-y-3 mb-8">
              {["Bottom-nav mobile dashboard", "Tap the voice orb to ask anything", "Install on iOS & Android (tap below)", "Syncs with your desktop account"].map((item) => (
                <li key={item} className="flex items-center gap-2 text-sm text-slate-300">
                  <Check className="w-4 h-4 text-[#FF4444] shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
            <button
              onClick={() => void promptInstall()}
              disabled={!isInstallable}
              className={`inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl font-semibold text-lg transition shadow-lg ${
                isInstallable
                  ? "bg-[#FF4444] text-white hover:bg-[#ff6b3d] shadow-[#FF4444]/20"
                  : "bg-white/10 text-slate-400 border border-white/10 cursor-not-allowed"
              }`}
            >
              {isInstalled ? (
                <><Check className="w-5 h-5" /> Installed</>
              ) : isInstallable ? (
                <><Download className="w-5 h-5" /> Install Mobile App</>
              ) : (
                <><Smartphone className="w-5 h-5" /> Add to Home Screen</>
              )}
            </button>
            {!isInstallable && (
              <p className="font-rajdhani text-[12px] text-slate-500 mt-4 leading-relaxed max-w-sm">
                Your browser hasn't offered the install prompt yet. On iOS, tap the Share icon, then
                &ldquo;Add to Home Screen.&rdquo; On Android, open the menu (⋮) and choose
                &ldquo;Install app&rdquo; or &ldquo;Add to Home screen.&rdquo;
              </p>
            )}
          </div>

          {/* Phone mock */}
          <div className="hud-panel p-6 max-w-xs mx-auto md:ml-auto">
            <span className="corner-br" />
            <div className="rounded-2xl border border-[rgba(160,21,21,0.2)] bg-black/60 p-4 space-y-3">
              <div className="flex items-center gap-2 pb-3 border-b border-[rgba(160,21,21,0.15)]">
                <img src="/carvis-logo.png" alt="" className="h-6 w-6 object-contain" />
                <span className="font-orbitron text-xs font-bold text-[#FF4444] tracking-wider">CARVIS</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-lg bg-[rgba(255,30,30,0.08)] p-3">
                  <div className="font-mono-data text-2xl font-bold text-[#FF9500]">3</div>
                  <div className="text-[9px] text-slate-500 uppercase tracking-wider">Due Today</div>
                </div>
                <div className="rounded-lg bg-[rgba(255,30,30,0.08)] p-3">
                  <div className="font-mono-data text-2xl font-bold text-[#FF4444]">12</div>
                  <div className="text-[9px] text-slate-500 uppercase tracking-wider">This Week</div>
                </div>
              </div>
              <div className="flex justify-center pt-2">
                <div className="w-14 h-14 rounded-full border-2 border-[#FF4444] bg-[rgba(255,30,30,0.12)] flex items-center justify-center shadow-[0_0_24px_rgba(255,68,68,0.35)]">
                  <Mic className="w-6 h-6 text-[#FF4444]" />
                </div>
              </div>
              <p className="text-center text-[10px] text-slate-500 tracking-wide">Hold to speak</p>
            </div>
          </div>
        </div>

        {/* Back */}
        <div className="text-center mt-16">
          <Link href="/" className="text-sm text-slate-500 hover:text-white transition">
            ← Back to CARVIS
          </Link>
        </div>
      </div>
    </div>
  );
}
