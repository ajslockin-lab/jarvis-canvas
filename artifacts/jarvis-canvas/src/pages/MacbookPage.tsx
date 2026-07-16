import { Laptop, Monitor, Calendar, Mic, Zap, BookOpen, ArrowRight } from "lucide-react";
import { Link } from "wouter";

/* macOS desktop page — split out from the landing page. Public (it's
   build-from-source instructions + marketing for the native macOS variant). */
export default function MacbookPage() {
  return (
    <div className="hud-bg min-h-screen text-[#f5f5f5] font-sans">
      <div className="hud-scanline" />

      {/* Header */}
      <div className="border-b border-[rgba(160,21,21,0.15)] bg-black/40 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <img src="/carvis-logo.png" alt="" className="h-7 w-7 object-contain" />
            <span className="text-base font-bold tracking-[0.2em] text-[#FF4444]">CARVIS</span>
          </Link>
          <Link href="/signin" className="text-sm font-medium text-white bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg transition border border-white/10">
            Sign In <ArrowRight className="w-4 h-4 inline" />
          </Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-16">
        {/* Hero */}
        <div className="text-center mb-16">
          <div className="text-xs font-bold tracking-[0.3em] text-[#FF4444] uppercase mb-4">MacBook Variant</div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white mb-4">
            CARVIS, <span className="text-[#FF6B3D]">Natively on macOS</span>
          </h1>
          <p className="text-slate-400 max-w-2xl mx-auto leading-relaxed">
            A floating desktop orb, deep macOS automation, screen awareness, and hands-free voice control.
            Fully local — your keys never leave your machine.
          </p>
        </div>

        {/* Feature cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          {[
            { icon: <Laptop className="w-6 h-6" />, title: "Floating Desktop Orb", desc: "Transparent Three.js particle overlay on your desktop — always visible, always listening. Click or clap to activate.", color: "text-[#FF4444]" },
            { icon: <Monitor className="w-6 h-6" />, title: "Screen Awareness", desc: "Screenshot + Claude Vision for visual context, and AppleScript window enumeration to know what apps are open.", color: "text-[#FF6B3D]" },
            { icon: <Calendar className="w-6 h-6" />, title: "macOS Automation", desc: "Read Apple Calendar, check Mail, create Notes, open Terminal — all via native AppleScript. No OAuth needed.", color: "text-emerald-400" },
            { icon: <Mic className="w-6 h-6" />, title: "Dual TTS Pipeline", desc: "ElevenLabs Conversational AI for low-latency dialogue, plus Fish Audio with the iconic JARVIS voice.", color: "text-pink-400" },
            { icon: <Zap className="w-6 h-6" />, title: "Clap-to-Wake", desc: "Hands-free: clap twice and CARVIS starts listening. No keyboard or click needed.", color: "text-[#FF4444]" },
            { icon: <BookOpen className="w-6 h-6" />, title: "School App Permissions", desc: "20+ education app toggles — Canvas, Google Drive, Infinite Campus, Outlook 365, and more.", color: "text-[#A01515]" },
          ].map((f) => (
            <div key={f.title} className="hud-panel p-6">
              <span className="corner-br" />
              <div className={`mb-4 ${f.color}`}>{f.icon}</div>
              <h3 className="font-orbitron text-sm font-bold tracking-wide text-[#f5f5f5] mb-2">{f.title}</h3>
              <p className="font-rajdhani text-[13px] text-[rgba(245,245,245,0.4)] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Install steps */}
        <div className="hud-panel p-8">
          <span className="corner-br" />
          <div className="flex items-center gap-3 mb-6">
            <div className="p-1.5 border border-[rgba(255,68,68,0.25)] text-[#FF4444] rounded">
              <Laptop className="w-5 h-5" />
            </div>
            <h3 className="font-orbitron text-xs font-bold tracking-[0.2em] text-[#FF4444] uppercase">Install & Run on macOS</h3>
          </div>
          <div className="space-y-4">
            <div className="flex gap-4">
              <span className="font-mono-data text-lg font-bold text-[#FF4444]/30 shrink-0 w-6">1</span>
              <div>
                <p className="font-orbitron text-sm font-bold text-[#f5f5f5] mb-1">Clone & install the desktop app</p>
                <code className="block font-mono text-[12px] text-[#FF6B3D] bg-[#0a0000] border border-[rgba(160,21,21,0.2)] rounded px-3 py-2">{"git clone https://github.com/ajslockin-lab/jarvis-canvas.git"}</code>
                <code className="block font-mono text-[12px] text-[#FF6B3D] bg-[#0a0000] border border-[rgba(160,21,21,0.2)] rounded px-3 py-2 mt-1">{"cd jarvis-canvas && pnpm install"}</code>
              </div>
            </div>
            <div className="flex gap-4">
              <span className="font-mono-data text-lg font-bold text-[#FF4444]/30 shrink-0 w-6">2</span>
              <div>
                <p className="font-orbitron text-sm font-bold text-[#f5f5f5] mb-1">Configure your environment</p>
                <p className="font-rajdhani text-[13px] text-[rgba(245,245,245,0.4)] mb-2">
                  Copy .env.example to .env and fill in your keys. You'll need a{" "}
                  <span className="text-[#FF6B3D]">Groq</span> API key (free tier available),
                  an <span className="text-[#FF6B3D]">encryption key</span> (any 64-char hex string),
                  and optionally <span className="text-[#FF6B3D]">ElevenLabs</span> for better voice.
                </p>
                <code className="block font-mono text-[12px] text-[#FF6B3D] bg-[#0a0000] border border-[rgba(160,21,21,0.2)] rounded px-3 py-2">{"cp .env.example .env  # then edit with your keys"}</code>
              </div>
            </div>
            <div className="flex gap-4">
              <span className="font-mono-data text-lg font-bold text-[#FF4444]/30 shrink-0 w-6">3</span>
              <div>
                <p className="font-orbitron text-sm font-bold text-[#f5f5f5] mb-1">Launch everything</p>
                <code className="block font-mono text-[12px] text-emerald-400 bg-[#0a0000] border border-[rgba(160,21,21,0.2)] rounded px-3 py-2">{"pnpm dev  # starts Postgres + API + frontend in one command"}</code>
                <p className="font-rajdhani text-[12px] text-[rgba(245,245,245,0.3)] mt-2">
                  Then open <code className="text-[#FF6B3D]">http://localhost:20034</code> in Chrome.
                  The app auto-creates the database, pushes the schema, and builds the API on first run.
                </p>
              </div>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-[rgba(160,21,21,0.15)] flex items-start gap-2">
            <Zap className="w-4 h-4 text-[#5a7a8a] mt-0.5 shrink-0" />
            <p className="font-rajdhani text-[12px] text-[rgba(245,245,245,0.4)] leading-relaxed">
              For the floating Swift orb overlay (clap-to-wake, transparent window), see{" "}
              <a
                href="https://github.com/ajslockin-lab/jarvis-canvas"
                target="_blank"
                rel="noopener"
                className="text-[#FF6B3D] underline underline-offset-2 hover:text-[#ff8a5c] transition"
              >
                the Carvis2 repo
              </a>
              {" "}which includes the Xcode project for the desktop overlay.
              Requires macOS 13+ and Accessibility permissions for screen awareness.
              All API keys stay local.
            </p>
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
