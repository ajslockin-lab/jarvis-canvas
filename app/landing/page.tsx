"use client";

import { useEffect, useState } from "react";
import { Sparkles, ArrowRight, Zap, Calendar, BookOpen, Mic, Check, Star } from "lucide-react";
import Link from "next/link";

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
    <div className="hud-bg min-h-screen text-[#e8f4f8] font-sans overflow-x-hidden">
      <div className="hud-scanline" />
      {/* Nav */}
      <nav className={`fixed top-0 w-full z-50 px-6 py-4 flex items-center justify-between transition-all duration-300 ${scrolled ? "bg-[#050A10]/95 backdrop-blur-xl border-b border-[#00B4FF]/10" : "bg-transparent"}`}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="text-lg font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">JARVIS</span>
        </div>
        <div className="hidden md:flex items-center gap-8">
          <a href="#features" className="text-sm text-slate-400 hover:text-white transition">Features</a>
          <a href="#how-it-works" className="text-sm text-slate-400 hover:text-white transition">How It Works</a>
          <Link href="/dashboard" className="text-sm font-medium text-white bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg transition border border-white/10">
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
            <Link href="/dashboard" onClick={() => setMenuOpen(false)} className="text-xl text-cyan-400 hover:text-cyan-300 transition">Open Dashboard →</Link>
          </div>
        </div>
      )}

      {/* Hero */}
      <section className="relative min-h-screen flex items-center justify-center px-6 pt-24 pb-16 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(37,99,235,0.12)_0%,transparent_50%),radial-gradient(circle_at_70%_30%,rgba(236,72,153,0.06)_0%,transparent_40%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:60px_60px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_70%)]" />
        <div className="relative z-10 max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-sm font-medium mb-8">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Actively Building — Join the Beta
          </div>
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 leading-[1.1]">
            Meet <span className="bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 bg-clip-text text-transparent">JARVIS</span>.<br />
            Your AI That Actually<br />Understands Canvas.
          </h1>
          <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Stop drowning in assignments. JARVIS connects directly to your Canvas, tracks every deadline, reads your modules, and explains anything — all with a voice assistant that feels like talking to a tutor who actually cares.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <Link href="/dashboard" className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-white text-black font-semibold text-lg hover:bg-slate-200 transition shadow-lg shadow-white/10">
              Start Your Free Setup <ArrowRight className="w-5 h-5" />
            </Link>
            <button className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-white/5 text-white font-semibold text-lg border border-white/10 hover:bg-white/10 transition">
              Watch How It Works
            </button>
          </div>

          {/* Product Demo Card */}
          <div className="max-w-2xl mx-auto rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6 text-left shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-lg shadow-lg shadow-cyan-500/20">🎓</div>
              <div>
                <div className="font-semibold text-sm">JARVIS Assistant</div>
                <div className="text-xs text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Online — Connected to Canvas
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-cyan-500/10 border border-cyan-500/15 text-sm text-slate-200 leading-relaxed">
                Hey! I pulled your Canvas for this week. You have <span className="text-emerald-400 font-semibold">4 assignments</span> due, and your <span className="text-red-400 font-semibold">⚠️ Calc II problem set</span> is due tomorrow at 11:59 PM. Want me to walk through the first module on integrals, or should I break this into a study plan?
              </div>
              <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 text-sm text-slate-300 ml-6 leading-relaxed">
                Can you explain the substitution method from Module 4? I'm lost.
              </div>
              <div className="p-3.5 rounded-xl bg-cyan-500/10 border border-cyan-500/15 text-sm text-slate-200 leading-relaxed">
                Absolutely — pulling Module 4 now. Here's substitution in 3 steps: <span className="text-emerald-400 font-semibold">(1)</span> Pick a part to be 'u', <span className="text-emerald-400 font-semibold">(2)</span> Find du/dx, <span className="text-emerald-400 font-semibold">(3)</span> Rewrite in terms of u and integrate. Want me to walk through the first example?
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <div className="border-y border-white/5 bg-white/[0.02]">
        <div className="max-w-5xl mx-auto px-6 py-10 flex flex-wrap justify-center gap-12 md:gap-16">
          {[
            { num: "500+", label: "Students Using JARVIS" },
            { num: "10k+", label: "Assignments Tracked" },
            { num: "50+", label: "Schools Connected" },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-3xl md:text-4xl font-extrabold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">{s.num}</div>
              <div className="text-sm text-slate-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Problem Section */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <span className="inline-block px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold uppercase tracking-wider mb-4">The Problem</span>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Canvas Wasn't Built for Students.<br />So We Built JARVIS.</h2>
            <p className="text-slate-400 max-w-xl mx-auto">You shouldn't need a spreadsheet, 5 apps, and a calendar just to know what homework is due. Canvas tells you what's there — JARVIS tells you what to do about it.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: "😵‍💫", title: "Assignment Overload", desc: "Due dates buried across modules, announcements, and syllabi. You miss deadlines because nothing is in one place." },
              { icon: "📅", title: "Calendar Chaos", desc: "Tests, quizzes, project deadlines, and lab reports — scattered across Canvas, your notes, and your head." },
              { icon: "📖", title: "Module Maze", desc: "Modules are walls of text. You spend more time figuring out what to read than actually learning." },
              { icon: "🤷", title: "Stuck & Alone", desc: "You're confused at 2 AM and your professor won't email back for 3 days. You need help now." },
            ].map((card, i) => (
              <div key={i} className="fade-in p-6 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.05] transition-all group">
                <div className="text-3xl mb-3 group-hover:scale-110 transition-transform inline-block">{card.icon}</div>
                <h3 className="font-bold text-lg mb-2">{card.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features — Bento Grid */}
      <section id="features" className="py-24 px-6 bg-white/[0.02] border-y border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <span className="inline-block px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-bold uppercase tracking-wider mb-4">Features</span>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Everything You Need.<br />Nothing You Don't.</h2>
            <p className="text-slate-400 max-w-xl mx-auto">JARVIS plugs into Canvas and turns your course chaos into a clear, organized, AI-powered workflow.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: <Zap className="w-5 h-5" />, title: "Direct Canvas Sync", desc: "Connects straight to your Canvas account. No manual entry. Pulls every due date, module, and announcement automatically.", tags: ["Auto-sync", "Real-time"] },
              { icon: <Calendar className="w-5 h-5" />, title: "Smart Assignment Tracker", desc: "All assignments in one dashboard, sorted by urgency. Priority scoring based on grade weight and deadline.", tags: ["Priority", "Grade weight"] },
              { icon: <BookOpen className="w-5 h-5" />, title: "Unified Calendar", desc: "Deadlines, test dates, and study sessions all in one place. Visual timeline so you can see crunch weeks before they hit.", tags: ["Timeline", "Study blocks"] },
              { icon: <Star className="w-5 h-5" />, title: "Grade & Score Tracker", desc: "Input your scores as they come in. JARVIS calculates where you stand and what you need on the final.", tags: ["What-if", "GPA"] },
              { icon: <Check className="w-5 h-5" />, title: "Module Summaries", desc: "JARVIS reads your Canvas modules and breaks them down into digestible summaries with key concepts.", tags: ["Auto-summarize"] },
              { icon: <Mic className="w-5 h-5" />, title: "Voice-First AI Tutor", desc: "Ask anything. 'Explain chapter 3.' 'Quiz me on bio.' JARVIS talks you through it — hands-free.", tags: ["Hands-free", "Smart explain"] },
            ].map((f, i) => (
              <div key={i} className="fade-in p-6 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.05] transition-all group">
                <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-4 group-hover:scale-110 transition-transform">
                  {f.icon}
                </div>
                <h3 className="font-bold text-lg mb-2">{f.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed mb-4">{f.desc}</p>
                <div className="flex gap-2 flex-wrap">
                  {f.tags.map((t) => (
                    <span key={t} className="px-2 py-0.5 rounded-md bg-white/[0.05] text-[11px] font-semibold text-slate-400 border border-white/[0.06]">{t}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <span className="inline-block px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-4">Get Started</span>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Up and Running in 60 Seconds.</h2>
            <p className="text-slate-400 max-w-xl mx-auto">No complicated setup. No manual entry. Just connect, sync, and let JARVIS handle the rest.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { step: "1", title: "Connect Canvas", desc: "Sign in with your Canvas account. JARVIS pulls all your courses, assignments, and modules instantly." },
              { step: "2", title: "Review Your Dashboard", desc: "See everything due this week, upcoming tests, and module summaries — all organized and prioritized." },
              { step: "3", title: "Ask JARVIS Anything", desc: "Voice or text. Explain a module, quiz yourself, plan your study time, or check what you need on the final." },
            ].map((s) => (
              <div key={s.step} className="fade-in relative p-8 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.12] transition-all text-center">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-extrabold text-xl mx-auto mb-5 shadow-lg shadow-cyan-500/20">
                  {s.step}
                </div>
                <h3 className="font-bold text-lg mb-2">{s.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(37,99,235,0.15)_0%,transparent_60%)]" />
        <div className="relative z-10 max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-5xl font-bold mb-4">Stop Drowning. Start Organized.</h2>
          <p className="text-lg text-slate-400 mb-8">Join students who are already using JARVIS to stay ahead of their Canvas workload.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/dashboard" className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-white text-black font-semibold text-lg hover:bg-slate-200 transition shadow-lg shadow-white/10">
              Get Free Early Access <ArrowRight className="w-5 h-5" />
            </Link>
            <button className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-white/5 text-white font-semibold text-lg border border-white/10 hover:bg-white/10 transition">
              Join the Discord
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-10 px-6 text-center">
        <div className="flex items-center justify-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-xs shadow-lg shadow-cyan-500/20">🎓</div>
          <span className="text-lg font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">JARVIS</span>
        </div>
        <p className="text-sm text-slate-500">Built by students, for students. Because Canvas wasn't enough.</p>
        <p className="text-xs text-slate-600 mt-2">© 2026 JARVIS. Ship fast, iterate faster.</p>
      </footer>

      <style jsx>{`
        .fade-in {
          opacity: 0;
          transform: translateY(24px);
          transition: opacity 0.5s ease, transform 0.5s ease;
        }
        .fade-in.visible {
          opacity: 1;
          transform: translateY(0);
        }
      `}</style>
    </div>
  );
}
