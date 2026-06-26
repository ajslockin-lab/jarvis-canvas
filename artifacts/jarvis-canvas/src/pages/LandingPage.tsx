import { useEffect, useState } from "react";
import { Sparkles, ArrowRight, Zap, Calendar, BookOpen, Mic, Check, Smartphone, Monitor, Download, Laptop, Puzzle, Chrome } from "lucide-react";
import { Link, useLocation } from "wouter";
import { usePWAInstall } from "@/hooks/use-pwa-install";
import { useIsMobile } from "@/hooks/use-mobile";
import CinematicDemo from "@/components/CinematicDemo";

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { isInstallable, isInstalled, promptInstall } = usePWAInstall();
  const [, navigate] = useLocation();
  const isMobile = useIsMobile();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;

    if (isStandalone || isMobile) {
      navigate("/signup", { replace: true });
    }
  }, [isMobile, navigate]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add("visible");
        });
      },
      { threshold: 0.1 }
    );
    document.querySelectorAll(".fade-in").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="hud-bg min-h-screen text-[#f5f5f5] font-sans overflow-x-hidden">
      <div className="hud-scanline" />
      <nav className={`fixed top-0 w-full z-50 px-6 py-4 flex items-center justify-between transition-all duration-300 ${scrolled ? "bg-black/95 backdrop-blur-xl border-b border-[rgba(160,21,21,0.15)]" : "bg-transparent"}`}>
        <div className="flex items-center gap-2">
          <img src="/carvis-logo.png" alt="" className="h-8 w-8 object-contain" />
          <span className="text-lg font-bold tracking-[0.2em] text-[#FF4444]">CARVIS</span>
       </div>
        <div className="hidden md:flex items-center gap-8">
          <a href="#demo" className="text-sm text-slate-400 hover:text-white transition">Demo</a>
          <a href="#features" className="text-sm text-slate-400 hover:text-white transition">Features</a>
          <a href="#how-it-works" className="text-sm text-slate-400 hover:text-white transition">How It Works</a>
          <a href="#extension" className="text-sm text-slate-400 hover:text-white transition">Extension</a>
          <a href="#mobile-app" className="text-sm text-slate-400 hover:text-white transition">Mobile App</a>
          <a href="#macbook" className="text-sm text-slate-400 hover:text-white transition">MacBook</a>
          <button
            onClick={isInstallable ? () => void promptInstall() : undefined}
            disabled={!isInstallable}
            className={`text-sm font-medium px-4 py-2 rounded-lg transition ${
              isInstallable
                ? "text-[#FF4444] border border-[#FF4444]/30 hover:bg-[#FF4444]/10"
                : "text-slate-500 border border-slate-700 cursor-not-allowed"
            }`}
          >
            {isInstalled ? "App Installed" : isInstallable ? "Install App" : "Add to Home Screen"}
         </button>
          <Link href="/dashboard" className="text-sm font-medium text-white bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg transition border border-white/10">
            Desktop App
         </Link>
       </div>
        <button className="md:hidden text-white/70" onClick={() => setMenuOpen(!menuOpen)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
       </button>
     </nav>

      {menuOpen && (
        <div className="fixed inset-0 z-[60] bg-[#060911]/98 backdrop-blur-xl md:hidden p-8 pt-20">
          <button className="absolute top-4 right-4 text-white/50" onClick={() => setMenuOpen(false)}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
         </button>
          <div className="flex flex-col gap-6">
            <a href="#demo" onClick={() => setMenuOpen(false)} className="text-xl text-slate-300 hover:text-white transition">Demo</a>
            <a href="#features" onClick={() => setMenuOpen(false)} className="text-xl text-slate-300 hover:text-white transition">Features</a>
            <a href="#how-it-works" onClick={() => setMenuOpen(false)} className="text-xl text-slate-300 hover:text-white transition">How It Works</a>
            <a href="#extension" onClick={() => setMenuOpen(false)} className="text-xl text-slate-300 hover:text-white transition">Chrome Extension</a>
            <a href="#mobile-app" onClick={() => setMenuOpen(false)} className="text-xl text-slate-300 hover:text-white transition">Mobile App</a>
            <a href="#macbook" onClick={() => setMenuOpen(false)} className="text-xl text-slate-300 hover:text-white transition">MacBook</a>
            <button
              onClick={() => { setMenuOpen(false); if (isInstallable) void promptInstall(); }}
              disabled={!isInstallable}
              className={`text-xl transition text-left ${isInstallable ? "text-[#FF4444] hover:text-[#ff6b3d]" : "text-slate-500 cursor-not-allowed"}`}
            >
              {isInstalled ? "App Installed" : "Install App"}
           </button>
            <Link href="/dashboard" onClick={() => setMenuOpen(false)} className="text-xl text-[#FF4444] hover:text-[#ff6b3d] transition">Desktop App</Link>
         </div>
       </div>
      )}

      <section className="relative min-h-screen flex items-center justify-center px-6 pt-24 pb-16 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,30,30,0.12)_0%,transparent_50%),radial-gradient(circle_at_70%_30%,rgba(160,21,21,0.08)_0%,transparent_40%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:60px_60px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_70%)]" />
        <div className="relative z-10 max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#FF4444]/10 border border-[#FF4444]/20 text-[#FF4444] text-sm font-medium mb-8">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Actively Building — Join the Beta
         </div>
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 leading-[1.1]">
            Meet <span className="text-[#FF4444]">CARVIS</span>.<br />
            Your AI That Actually<br />Understands Canvas.
         </h1>
          <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Stop drowning in assignments. CARVIS connects directly to your Canvas, tracks every deadline, reads your modules, and explains anything — all with a voice assistant that feels like talking to a tutor who actually cares.
         </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <Link href="/signin" className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-white text-black font-semibold text-lg hover:bg-slate-200 transition shadow-lg shadow-white/10">
              Start Your Free Setup <ArrowRight className="w-5 h-5" />
           </Link>
            <a href="#demo" className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-white/5 text-white font-semibold text-lg border border-white/10 hover:bg-white/10 transition">
              Watch How It Works
           </a>
         </div>

          {/* Cinematic auto-play demo — plays when scrolled into view */}
          <CinematicDemo active={true} />
       </div>
     </section>

      <div className="border-y border-white/5 bg-white/[0.02]">
        <div className="max-w-5xl mx-auto px-6 py-10 flex flex-wrap justify-center gap-12 md:gap-16">
          {[
            { num: "—", label: "Students Using CARVIS" },
            { num: "—", label: "Assignments Tracked" },
            { num: "—", label: "Deadline Hit Rate" },
            { num: "—", label: "Average Rating" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-3xl font-extrabold text-white mb-1">{stat.num}</div>
              <div className="text-sm text-slate-500">{stat.label}</div>
           </div>
          ))}
       </div>
     </div>

      <section id="features" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 fade-in">
            <div className="text-xs font-bold tracking-[0.3em] text-[#FF4444] uppercase mb-4">Features</div>
            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white mb-4">
              Everything You Need to<br /><span className="text-[#FF6B3D]">Crush Your Semester</span>
           </h2>
         </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: <Calendar className="w-6 h-6" />, title: "Smart Deadline Tracking", desc: "CARVIS syncs directly with Canvas and shows exactly what's due, when, and how urgent — color-coded and sorted so you never miss a deadline.", color: "text-[#FF4444]" },
              { icon: <Mic className="w-6 h-6" />, title: "Voice Commands", desc: "Just say 'what's due this week' or 'explain Module 3' — CARVIS understands natural language and responds out loud, like a real tutor.", color: "text-[#FF6B3D]" },
              { icon: <Zap className="w-6 h-6" />, title: "AI Study Intelligence", desc: "CARVIS reads your Canvas modules, understands your workload, and proactively suggests when to study and what to prioritize.", color: "text-[#FF4444]" },
              { icon: <BookOpen className="w-6 h-6" />, title: "Instant Explanations", desc: "Ask CARVIS to explain any concept from your course materials and get a clear, concise answer — like having a tutor available 24/7.", color: "text-emerald-400" },
              { icon: <Sparkles className="w-6 h-6" />, title: "Proactive Alerts", desc: "CARVIS watches for upcoming deadlines, grade drops, and heavy workload weeks — and tells you before it's a problem.", color: "text-[#A01515]" },
              { icon: <Check className="w-6 h-6" />, title: "Grade Tracking", desc: "See all your current grades in one place, with trends and letter-grade estimates. Know where you stand at all times.", color: "text-pink-400" },
            ].map((f) => (
              <div key={f.title} className="fade-in hud-panel p-6">
                <span className="corner-br" />
                <div className={`mb-4 ${f.color}`}>{f.icon}</div>
                <h3 className="font-orbitron text-sm font-bold tracking-wide text-[#f5f5f5] mb-2">{f.title}</h3>
                <p className="font-rajdhani text-[13px] text-[rgba(245,245,245,0.4)] leading-relaxed">{f.desc}</p>
             </div>
            ))}
         </div>
       </div>
     </section>

      <section id="how-it-works" className="py-24 px-6 bg-white/[0.015]">
        <div className="max-w-4xl mx-auto text-center fade-in">
          <div className="text-xs font-bold tracking-[0.3em] text-[#FF4444] uppercase mb-4">How It Works</div>
          <h2 className="text-4xl font-extrabold text-white mb-16">Up and Running in <span className="text-[#FF4444]">3 Minutes</span></h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: "01", title: "Connect Canvas", desc: "Paste your Canvas URL and Personal Access Token. CARVIS verifies and connects instantly — no admin needed." },
              { step: "02", title: "Auto-Sync", desc: "CARVIS pulls all your courses, assignments, and grades from Canvas automatically. It stays updated every time you open the dashboard." },
              { step: "03", title: "Ask Anything", desc: "Use the voice interface or just browse the dashboard. CARVIS knows what you need and surfaces it without you having to dig." },
            ].map((s) => (
              <div key={s.step} className="hud-panel p-6 text-left">
                <span className="corner-br" />
                <div className="font-mono-data text-4xl font-bold text-[#FF4444]/20 mb-4">{s.step}</div>
                <h3 className="font-orbitron text-sm font-bold tracking-wide text-[#FF4444] mb-2">{s.title}</h3>
                <p className="font-rajdhani text-[13px] text-[rgba(245,245,245,0.4)] leading-relaxed">{s.desc}</p>
             </div>
            ))}
         </div>
       </div>
     </section>

      <section id="extension" className="py-24 px-6 bg-[rgba(255,30,30,0.03)] border-y border-[rgba(160,21,21,0.12)]">
        <div className="max-w-5xl mx-auto fade-in">
          <div className="text-center mb-16">
            <div className="text-xs font-bold tracking-[0.3em] text-[#FF4444] uppercase mb-4">Chrome Extension</div>
            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white mb-4">
              CARVIS <span className="text-[#FF6B3D]">Inside Canvas</span>
           </h2>
            <p className="text-slate-400 max-w-2xl mx-auto leading-relaxed">
              A floating red bubble on every Canvas page — click it to see your deadlines, grades,
              and talk to the AI agent. The extension controls the Canvas page for you.
           </p>
         </div>

          <div className="grid md:grid-cols-3 gap-6 mb-12">
            {[
              { icon: <Puzzle className="w-6 h-6" />, title: "One-Click Access", desc: "A glowing red C bubble on every Canvas page. Click it → the CARVIS overlay slides in. No new tabs.", color: "text-[#FF4444]" },
              { icon: <Zap className="w-6 h-6" />, title: "Page Control", desc: "Tell CARVIS 'scroll down', 'open assignments', or 'open grades' — it clicks and navigates for you.", color: "text-[#FF6B3D]" },
              { icon: <Monitor className="w-6 h-6" />, title: "Context Aware", desc: "Reads your current Canvas page, finds every button and link, and understands what's on screen.", color: "text-emerald-400" },
            ].map((f) => (
              <div key={f.title} className="fade-in hud-panel p-6">
                <span className="corner-br" />
                <div className={`mb-4 ${f.color}`}>{f.icon}</div>
                <h3 className="font-orbitron text-sm font-bold tracking-wide text-[#f5f5f5] mb-2">{f.title}</h3>
                <p className="font-rajdhani text-[13px] text-[rgba(245,245,245,0.4)] leading-relaxed">{f.desc}</p>
             </div>
            ))}
         </div>

          <div className="text-center">
            <Link
              href="/extension"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-[#FF4444] text-white font-semibold text-lg hover:bg-[#ff6b3d] transition shadow-lg shadow-[#FF4444]/25"
            >
              <Download className="w-5 h-5" /> Download Extension & Setup Guide
           </Link>
            <p className="font-rajdhani text-[12px] text-slate-600 mt-3">
              Free. No Chrome Web Store account needed. 5-step install.
           </p>
         </div>
       </div>
     </section>

      <section id="mobile-app" className="py-24 px-6 bg-white/[0.015]">
        <div className="max-w-4xl mx-auto fade-in">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <div className="text-xs font-bold tracking-[0.3em] text-[#FF4444] uppercase mb-4">Mobile PWA</div>
              <h2 className="text-4xl font-extrabold text-white mb-4">
                CARVIS in Your <span className="text-[#FF6B3D]">Pocket</span>
             </h2>
              <p className="text-slate-400 leading-relaxed mb-6">
                Install CARVIS directly on your phone or tablet — voice commands, deadline alerts, and grades on the go.
                Works as a PWA: add to your home screen for a full-screen, offline-capable mobile experience.
             </p>
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
           </div>
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
       </div>
     </section>

      <section id="macbook" className="py-24 px-6 bg-[rgba(255,30,30,0.03)] border-y border-[rgba(160,21,21,0.12)]">
        <div className="max-w-5xl mx-auto fade-in">
          <div className="text-center mb-16">
            <div className="text-xs font-bold tracking-[0.3em] text-[#FF4444] uppercase mb-4">MacBook Variant</div>
            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white mb-4">
              CARVIS, <span className="text-[#FF6B3D]">Natively on macOS</span>
           </h2>
            <p className="text-slate-400 max-w-2xl mx-auto leading-relaxed">
              A floating desktop orb, deep macOS automation, screen awareness, and hands-free voice control.
              Fully local — your keys never leave your machine.
           </p>
         </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
            {[
              { icon: <Laptop className="w-6 h-6" />, title: "Floating Desktop Orb", desc: "Transparent Three.js particle overlay on your desktop — always visible, always listening. Click or clap to activate.", color: "text-[#FF4444]" },
              { icon: <Monitor className="w-6 h-6" />, title: "Screen Awareness", desc: "Screenshot + Claude Vision for visual context, and AppleScript window enumeration to know what apps are open.", color: "text-[#FF6B3D]" },
              { icon: <Calendar className="w-6 h-6" />, title: "macOS Automation", desc: "Read Apple Calendar, check Mail, create Notes, open Terminal — all via native AppleScript. No OAuth needed.", color: "text-emerald-400" },
              { icon: <Mic className="w-6 h-6" />, title: "Dual TTS Pipeline", desc: "ElevenLabs Conversational AI for low-latency dialogue, plus Fish Audio with the iconic JARVIS voice.", color: "text-pink-400" },
              { icon: <Zap className="w-6 h-6" />, title: "Clap-to-Wake", desc: "Hands-free: clap twice and CARVIS starts listening. No keyboard or click needed.", color: "text-[#FF4444]" },
              { icon: <BookOpen className="w-6 h-6" />, title: "School App Permissions", desc: "20+ education app toggles — Canvas, Google Drive, Infinite Campus, Outlook 365, and more.", color: "text-[#A01515]" },
            ].map((f) => (
              <div key={f.title} className="fade-in hud-panel p-6">
                <span className="corner-br" />
                <div className={`mb-4 ${f.color}`}>{f.icon}</div>
                <h3 className="font-orbitron text-sm font-bold tracking-wide text-[#f5f5f5] mb-2">{f.title}</h3>
                <p className="font-rajdhani text-[13px] text-[rgba(245,245,245,0.4)] leading-relaxed">{f.desc}</p>
             </div>
            ))}
         </div>

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
       </div>
     </section>

      <section className="py-24 px-6 text-center fade-in">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-4xl font-extrabold text-white mb-4">Ready to Stop Stressing</h2>
          <p className="text-slate-400 mb-10 leading-relaxed">
            Join students using CARVIS to stay on top of their coursework. Free to start, no credit card required.
         </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/signin" className="inline-flex items-center justify-center gap-2 px-10 py-5 rounded-xl bg-white text-black font-semibold text-lg hover:bg-slate-200 transition shadow-lg shadow-white/10">
              Get Started Free <ArrowRight className="w-5 h-5" />
           </Link>
            <a href="#extension" className="inline-flex items-center justify-center gap-2 px-8 py-5 rounded-xl bg-white/5 text-white font-semibold text-lg border border-white/10 hover:bg-white/10 transition">
              <Puzzle className="w-5 h-5" /> Get Chrome Extension
           </a>
         </div>
       </div>
     </section>

      <footer className="border-t border-white/5 py-10 px-6 text-center">
        <div className="flex items-center justify-center gap-2 mb-4">
          <img src="/carvis-logo.png" alt="" className="h-6 w-6 object-contain" />
          <span className="text-sm font-bold text-slate-400">CARVIS Canvas Assistant</span>
       </div>
        <p className="text-xs text-slate-600">Your Canvas data is encrypted and never shared. CARVIS only reads — never modifies — your Canvas account</p>
     </footer>
   </div>
  );
}
