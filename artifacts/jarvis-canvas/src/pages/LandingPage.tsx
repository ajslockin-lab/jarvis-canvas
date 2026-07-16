import { useEffect, useState } from "react";
import { Sparkles, ArrowRight, Zap, Calendar, BookOpen, Mic, Check, Puzzle } from "lucide-react";
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
          <Link href="/extension" className="text-sm text-slate-400 hover:text-white transition">Extension</Link>
          <Link href="/mobile" className="text-sm text-slate-400 hover:text-white transition">Mobile App</Link>
          <Link href="/macos" className="text-sm text-slate-400 hover:text-white transition">MacBook</Link>
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
            <Link href="/extension" onClick={() => setMenuOpen(false)} className="text-xl text-slate-300 hover:text-white transition">Chrome Extension</Link>
            <Link href="/mobile" onClick={() => setMenuOpen(false)} className="text-xl text-slate-300 hover:text-white transition">Mobile App</Link>
            <Link href="/macos" onClick={() => setMenuOpen(false)} className="text-xl text-slate-300 hover:text-white transition">MacBook</Link>
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
            Canvas · AI copilot · open beta
          </div>
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 leading-[1.05]">
            Stop opening Canvas<br />in a <span className="text-[#FF4444]">panic</span>.
          </h1>
          <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Carvis syncs your classes in the background and turns <span className="text-white font-medium">47 due dates</span>, <span className="text-white font-medium">6 unread announcements</span>, and <span className="text-white font-medium">a grade you're afraid to check</span> into one calm thing: <span className="text-white font-medium">what to do next</span>.
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
              { step: "01", title: "Connect Canvas", desc: "Paste your Canvas URL and Personal Access Token. CARVIS verifies and connects instantly — no admin needed. (No token? The browser extension syncs with the Canvas you're already logged into.)" },
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

      {/* The Extension / Mobile PWA / macOS desktop sections each live on
          their own routed page now. Extension is auth-gated (/extension);
          Mobile is at /mobile and macOS at /macos. */}

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
            <Link href="/extension" className="inline-flex items-center justify-center gap-2 px-8 py-5 rounded-xl bg-white/5 text-white font-semibold text-lg border border-white/10 hover:bg-white/10 transition">
              <Puzzle className="w-5 h-5" /> Get Chrome Extension
            </Link>
          </div>
          <div className="mt-6 text-sm text-slate-500">
            On mobile?{" "}
            <Link href="/mobile" className="text-[#FF6B3D] hover:text-[#ff8a5c] underline underline-offset-2">Install the app</Link>
            {" · "}on macOS?{" "}
            <Link href="/macos" className="text-[#FF6B3D] hover:text-[#ff8a5c] underline underline-offset-2">Native desktop</Link>
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
