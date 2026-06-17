import { useEffect, useState } from "react";
import { Sparkles, ArrowRight, Zap, Calendar, BookOpen, Mic, Check } from "lucide-react";
import { Link } from "wouter";

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

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
          <a href="#features" className="text-sm text-slate-400 hover:text-white transition">Features</a>
          <a href="#how-it-works" className="text-sm text-slate-400 hover:text-white transition">How It Works</a>
          <Link href="/signin" className="text-sm font-medium text-white bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg transition border border-white/10">
            Open Dashboard →
          </Link>
        </div>
        <button className="md:hidden text-white/70" onClick={() => setMenuOpen(!menuOpen)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
      </nav>

      {menuOpen && (
        <div className="fixed inset-0 z-[60] bg-[#060911]/98 backdrop-blur-xl md:hidden p-8 pt-20">
          <button className="absolute top-4 right-4 text-white/50" onClick={() => setMenuOpen(false)}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <div className="flex flex-col gap-6">
            <a href="#features" onClick={() => setMenuOpen(false)} className="text-xl text-slate-300 hover:text-white transition">Features</a>
            <a href="#how-it-works" onClick={() => setMenuOpen(false)} className="text-xl text-slate-300 hover:text-white transition">How It Works</a>
            <Link href="/signin" onClick={() => setMenuOpen(false)} className="text-xl text-[#FF4444] hover:text-[#ff6b3d] transition">Sign In →</Link>
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
            <button className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-white/5 text-white font-semibold text-lg border border-white/10 hover:bg-white/10 transition">
              Watch How It Works
            </button>
          </div>

          <div className="max-w-2xl mx-auto rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6 text-left shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-full bg-[#FF4444]/15 border border-[#FF4444]/25 flex items-center justify-center text-lg">🎓</div>
              <div>
                <div className="font-semibold text-sm">CARVIS Assistant</div>
                <div className="text-xs text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Online — Connected to Canvas
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-[#FF4444]/10 border border-[#FF4444]/15 text-sm text-slate-200 leading-relaxed">
                Hey! I pulled your Canvas for this week. You have <span className="text-emerald-400 font-semibold">4 assignments</span> due, and your <span className="text-red-400 font-semibold">⚠️ Calc II problem set</span> is due tomorrow at 11:59 PM. Want me to walk through the first module on integrals, or should I break this into a study plan?
              </div>
              <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 text-sm text-slate-300 ml-6 leading-relaxed">
                Can you explain the substitution method from Module 4? I'm lost.
              </div>
              <div className="p-3.5 rounded-xl bg-[#FF4444]/10 border border-[#FF4444]/15 text-sm text-slate-200 leading-relaxed">
                Absolutely — pulling Module 4 now. Here's substitution in 3 steps: <span className="text-emerald-400 font-semibold">(1)</span> Pick a part to be 'u', <span className="text-emerald-400 font-semibold">(2)</span> Find du/dx, <span className="text-emerald-400 font-semibold">(3)</span> Rewrite in terms of u and integrate. Want me to walk through the first example?
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="border-y border-white/5 bg-white/[0.02]">
        <div className="max-w-5xl mx-auto px-6 py-10 flex flex-wrap justify-center gap-12 md:gap-16">
          {[
            { num: "500+", label: "Students Using CARVIS" },
            { num: "10k+", label: "Assignments Tracked" },
            { num: "98%", label: "Deadline Hit Rate" },
            { num: "4.9★", label: "Average Rating" },
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

      <section className="py-24 px-6 text-center fade-in">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-4xl font-extrabold text-white mb-4">Ready to Stop Stressing?</h2>
          <p className="text-slate-400 mb-10 leading-relaxed">
            Join hundreds of students using CARVIS to stay on top of their coursework. Free to start, no credit card required.
          </p>
          <Link href="/signin" className="inline-flex items-center justify-center gap-2 px-10 py-5 rounded-xl bg-white text-black font-semibold text-lg hover:bg-slate-200 transition shadow-lg shadow-white/10">
            Get Started Free <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-white/5 py-10 px-6 text-center">
        <div className="flex items-center justify-center gap-2 mb-4">
          <img src="/carvis-logo.png" alt="" className="h-6 w-6 object-contain" />
          <span className="text-sm font-bold text-slate-400">CARVIS Canvas Assistant</span>
        </div>
        <p className="text-xs text-slate-600">Your Canvas data is encrypted and never shared. CARVIS only reads — never modifies — your Canvas account.</p>
      </footer>
    </div>
  );
}
