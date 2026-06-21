import { Puzzle, Download, Chrome, ArrowRight, Check, AlertCircle } from "lucide-react";
import { Link } from "wouter";

export default function ExtensionPage() {
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
        {/* Title */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#FF4444]/10 border border-[#FF4444]/20 text-[#FF4444] text-sm font-medium mb-6">
            <Puzzle className="w-4 h-4" /> Free Chrome Extension
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white mb-4">
            CARVIS <span className="text-[#FF6B3D]">Inside Canvas</span>
          </h1>
          <p className="text-slate-400 max-w-xl mx-auto leading-relaxed">
            A glowing red bubble on every Canvas page. Click it for deadlines, grades, voice commands,
            and AI-powered page control — all without leaving Canvas.
          </p>
        </div>

        {/* What it does - 3 cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-16">
          {[
            { icon: <Puzzle className="w-6 h-6" />, title: "One-Click Access", desc: "Red C bubble on every *.instructure.com page. Click → overlay slides in. No new tabs.", color: "text-[#FF4444]" },
            { icon: <Chrome className="w-6 h-6" />, title: "Page Control", desc: "'Scroll down', 'open assignments', 'open grades' — CARVIS clicks and navigates for you.", color: "text-[#FF6B3D]" },
            { icon: <AlertCircle className="w-6 h-6" />, title: "Context Aware", desc: "Reads your current Canvas page, finds every button and link, and understands what's on screen.", color: "text-emerald-400" },
          ].map((f) => (
            <div key={f.title} className="hud-panel p-6">
              <span className="corner-br" />
              <div className={`mb-4 ${f.color}`}>{f.icon}</div>
              <h3 className="font-orbitron text-sm font-bold tracking-wide text-[#f5f5f5] mb-2">{f.title}</h3>
              <p className="font-rajdhani text-[13px] text-[rgba(245,245,245,0.4)] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Download + Guide */}
        <div className="hud-panel p-8 mb-8">
          <span className="corner-br" />

          {/* Download button */}
          <div className="text-center mb-10">
            <h2 className="font-orbitron text-lg font-bold tracking-[0.15em] text-[#FF4444] mb-4">DOWNLOAD EXTENSION</h2>
            <p className="font-rajdhani text-[14px] text-[rgba(245,245,245,0.5)] mb-6">
              Download the extension files as a ZIP, then follow the steps below.
            </p>
            <a
              href="/api/extension/download"
              download
              className="inline-flex items-center justify-center gap-3 px-10 py-5 rounded-xl bg-[#FF4444] text-white font-semibold text-lg hover:bg-[#ff6b3d] transition shadow-lg shadow-[#FF4444]/25"
            >
              <Download className="w-6 h-6" /> Download Extension ZIP
            </a>
            <p className="font-rajdhani text-[12px] text-slate-600 mt-3">
              Small file (~15 KB). No account needed. Free forever.
            </p>
          </div>

          {/* Step by step */}
          <div className="border-t border-[rgba(160,21,21,0.15)] pt-8">
            <h3 className="font-orbitron text-xs font-bold tracking-[0.2em] text-[#FF4444] uppercase mb-8">Installation Guide</h3>
            <div className="space-y-6">
              {[
                {
                  step: "1",
                  title: "Download & extract the ZIP",
                  desc: "Click the download button above. Your browser saves a .zip file. Extract it (right-click → Extract All on Windows, or double-click on Mac). Remember where the extracted folder is.",
                },
                {
                  step: "2",
                  title: "Open Chrome Extensions",
                  desc: (
                    <>
                      Type{" "}
                      <code className="text-[#FF6B3D] bg-[#0a0000] px-1.5 py-0.5 rounded border border-[rgba(160,21,21,0.2)] text-[11px]">chrome://extensions</code>
                      {" "}in your Chrome address bar and press Enter. This opens the extensions management page.
                    </>
                  ),
                },
                {
                  step: "3",
                  title: "Enable Developer Mode",
                  desc: "Find the Developer mode toggle in the top-right corner of the extensions page. Turn it ON. You'll see new buttons appear.",
                },
                {
                  step: "4",
                  title: "Click 'Load unpacked'",
                  desc: "A new button appears called 'Load unpacked'. Click it, then select the extracted folder (the one with manifest.json inside). Chrome loads the extension immediately.",
                },
                {
                  step: "5",
                  title: "Open Canvas and use CARVIS!",
                  desc: "Go to your school's Canvas site. You'll see a glowing red C bubble in the bottom-right corner. Click it to open the CARVIS overlay. Sign in with your Canvas PAT to connect.",
                },
              ].map((s) => (
                <div key={s.step} className="flex gap-4">
                  <span className={`font-mono-data text-2xl font-bold shrink-0 w-8 ${s.step === "5" ? "text-emerald-400/50" : "text-[#FF4444]/30"}`}>
                    {s.step === "5" ? "✓" : s.step}
                  </span>
                  <div>
                    <p className="font-orbitron text-sm font-bold text-[#f5f5f5] mb-1">{s.title}</p>
                    <p className="font-rajdhani text-[13px] text-[rgba(245,245,245,0.4)] leading-relaxed">
                      {typeof s.desc === "string" ? s.desc : s.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="mt-8 pt-6 border-t border-[rgba(160,21,21,0.15)] space-y-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-[#5a7a8a] mt-0.5 shrink-0" />
              <p className="font-rajdhani text-[12px] text-[rgba(245,245,245,0.4)] leading-relaxed">
                <span className="text-[#f5f5f5] font-semibold">The extension requires the CARVIS web app to be running.</span>{" "}
                It opens an iframe to the CARVIS app for the overlay. If you're using the hosted version at carvis.app, it works automatically.
                If running locally, make sure <code className="text-[#FF6B3D] text-[11px]">localhost:20034</code> is up.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
              <p className="font-rajdhani text-[12px] text-[rgba(245,245,245,0.4)] leading-relaxed">
                The extension only operates on <code className="text-[#FF6B3D] text-[11px]">*.instructure.com</code> Canvas pages.
                It never reads data from other websites.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
              <p className="font-rajdhani text-[12px] text-[rgba(245,245,245,0.4)] leading-relaxed">
                After a Chrome restart, the extension stays loaded. You only need to do this setup once.
                If the extension disappears, just re-load unpacked from the same folder.
              </p>
            </div>
          </div>
        </div>

        {/* Back to main site */}
        <div className="text-center">
          <Link href="/" className="text-sm text-slate-500 hover:text-white transition">
            ← Back to CARVIS
          </Link>
        </div>
      </div>
    </div>
  );
}
