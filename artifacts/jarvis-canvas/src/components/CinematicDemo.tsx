import { useState, useEffect, useCallback, useRef } from "react";
import { Mic, AlertTriangle, BookOpen, Calendar, CheckCircle2 } from "lucide-react";

// ── Typewriter hook ──────────────────────────────────────────────────────

function useTypewriter(text: string, speed: number, started: boolean) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!started) return;
    setDisplayed("");
    setDone(false);
    let i = 0;
    const iv = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(iv);
        setDone(true);
      }
    }, speed);
    return () => clearInterval(iv);
  }, [text, speed, started]);

  return { displayed, done };
}

// ── Demo script (each step in the scene) ──────────────────────────────────

interface DemoStep {
  /** Who's talking — "carvis" or "user" */
  role: "carvis" | "user";
  /** Plain text that types out */
  text: string;
  /** After this step finishes, these dashboard items appear */
  reveal?: "deadlines" | "grades" | "tutor" | "voice";
  /** Delay before starting this step (ms after previous finishes) */
  delay: number;
}

const DEMO_SCRIPT: DemoStep[] = [
  {
    role: "carvis",
    text: "Connected to Canvas. Pulling your courses...",
    delay: 800,
  },
  {
    role: "carvis",
    text: "Done. You have 4 assignments due this week. The ⚠️ Calc II problem set is due tomorrow at 11:59 PM.",
    delay: 1200,
    reveal: "deadlines",
  },
  {
    role: "carvis",
    text: "Your current grades: Physics B+, Calc II C+, English A-. The Calc II score dropped 4 points since last week.",
    delay: 2200,
    reveal: "grades",
  },
  {
    role: "user",
    text: "Can you help me study for the Calc II exam?",
    delay: 1000,
  },
  {
    role: "carvis",
    text: "Sure — here's a study plan. Module 4 (integration by parts) is weighted highest on the exam. Start there, then review substitution. Want me to quiz you?",
    delay: 1800,
    reveal: "tutor",
  },
  {
    role: "user",
    text: "Yeah quiz me on substitution.",
    delay: 800,
  },
  {
    role: "carvis",
    text: "🎤 Listening... OK: What is ∫ 2x·cos(x²) dx? Take your time.",
    delay: 600,
    reveal: "voice",
  },
];

// ── Mini dashboard cards that appear during the demo ──────────────────────

function DeadlineCard({ visible }: { visible: boolean }) {
  return (
    <div
      className={`transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
    >
      <div className="hud-panel p-3 space-y-2">
        <div className="flex items-center gap-2 text-[#FF4444] text-xs font-bold tracking-wider uppercase">
          <Calendar className="w-3.5 h-3.5" /> Due This Week
        </div>
        {[
          { name: "Calc II Problem Set", due: "Tomorrow 11:59 PM", urgent: true },
          { name: "Physics Lab Report", due: "Wed 5:00 PM", urgent: false },
          { name: "English Essay Draft", due: "Fri 11:59 PM", urgent: false },
          { name: "CS Project Milestone", due: "Sun 11:59 PM", urgent: false },
        ].map((a) => (
          <div key={a.name} className="flex items-center justify-between text-xs">
            <span className={`flex items-center gap-1.5 ${a.urgent ? "text-red-400 font-semibold" : "text-slate-300"}`}>
              {a.urgent && <AlertTriangle className="w-3 h-3" />}
              {a.name}
            </span>
            <span className="text-slate-500">{a.due}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GradesCard({ visible }: { visible: boolean }) {
  return (
    <div
      className={`transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
    >
      <div className="hud-panel p-3 space-y-2">
        <div className="flex items-center gap-2 text-[#FF6B3D] text-xs font-bold tracking-wider uppercase">
          <BookOpen className="w-3.5 h-3.5" /> Grades
        </div>
        {[
          { name: "Physics", grade: "B+", change: "" },
          { name: "Calc II", grade: "C+", change: "↓4" },
          { name: "English", grade: "A-", change: "" },
        ].map((g) => (
          <div key={g.name} className="flex items-center justify-between text-xs">
            <span className="text-slate-300">{g.name}</span>
            <span className="flex items-center gap-1.5">
              <span className={`font-mono font-bold ${g.grade.startsWith("A") ? "text-emerald-400" : g.grade.startsWith("B") ? "text-[#FF6B3D]" : "text-red-400"}`}>
                {g.grade}
              </span>
              {g.change && <span className="text-red-400 text-[10px]">{g.change}</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TutorCard({ visible }: { visible: boolean }) {
  return (
    <div
      className={`transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
    >
      <div className="hud-panel p-3 space-y-2">
        <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold tracking-wider uppercase">
          <CheckCircle2 className="w-3.5 h-3.5" /> Study Plan
        </div>
        {[
          { step: "1", text: "Integration by Parts (Module 5) — 45 min", focus: true },
          { step: "2", text: "u-Substitution Review (Module 4) — 30 min", focus: false },
          { step: "3", text: "Practice Problems Ch. 7 — 25 min", focus: false },
        ].map((s) => (
          <div key={s.step} className="flex items-start gap-2 text-xs">
            <span className={`font-mono font-bold shrink-0 ${s.focus ? "text-emerald-400" : "text-slate-600"}`}>{s.step}.</span>
            <span className={s.focus ? "text-slate-200" : "text-slate-500"}>{s.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function VoiceCard({ visible }: { visible: boolean }) {
  return (
    <div
      className={`transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
    >
      <div className="hud-panel p-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full border-2 border-[#FF4444] bg-[rgba(255,30,30,0.15)] flex items-center justify-center animate-pulse shadow-[0_0_20px_rgba(255,68,68,0.3)]">
          <Mic className="w-4 h-4 text-[#FF4444]" />
        </div>
        <div>
          <div className="text-xs font-bold text-[#FF4444] tracking-wider uppercase">Voice Active</div>
          <div className="text-[10px] text-slate-500">Listening for your answer...</div>
        </div>
        <div className="ml-auto flex gap-0.5">
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className="w-0.5 bg-[#FF4444] rounded-full animate-pulse"
              style={{
                height: `${8 + Math.random() * 16}px`,
                animationDelay: `${i * 0.07}s`,
                animationDuration: `${0.4 + Math.random() * 0.4}s`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main cinematic demo component ─────────────────────────────────────────

interface Props {
  active: boolean;
}

export default function CinematicDemo({ active }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [started, setStarted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Start the demo when it scrolls into view or when active=true
  useEffect(() => {
    if (!active || started) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStarted(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );

    if (containerRef.current) observer.observe(containerRef.current);
    // Also start after a short delay in case the element is already visible
    const timer = setTimeout(() => setStarted(true), 3000);

    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [active, started]);

  const currentStep = DEMO_SCRIPT[stepIndex];
  const { displayed: typedText, done: typingDone } = useTypewriter(
    currentStep?.text ?? "",
    currentStep?.role === "carvis" ? 18 : 25,
    started && stepIndex >= 0,
  );

  // Advance to next step after typing finishes + delay
  useEffect(() => {
    if (!started || !typingDone || stepIndex >= DEMO_SCRIPT.length) return;

    const step = DEMO_SCRIPT[stepIndex];
    if (step.reveal) {
      setRevealed((prev) => new Set(prev).add(step.reveal));
    }

    const nextDelay = stepIndex < DEMO_SCRIPT.length - 1
      ? (DEMO_SCRIPT[stepIndex + 1]?.delay ?? 1000)
      : 0;

    const timer = setTimeout(() => {
      if (stepIndex < DEMO_SCRIPT.length - 1) {
        setStepIndex((i) => i + 1);
      }
    }, nextDelay);

    return () => clearTimeout(timer);
  }, [started, typingDone, stepIndex]);

  // Build the list of messages that have appeared so far
  const completedMessages = DEMO_SCRIPT.slice(0, stepIndex).map((s, i) => (
    <div
      key={i}
      className={`p-3.5 rounded-xl text-sm leading-relaxed ${
        s.role === "carvis"
          ? "bg-[#FF4444]/10 border border-[#FF4444]/15 text-slate-200"
          : "bg-white/5 border border-white/10 text-slate-300 ml-6"
      }`}
    >
      {s.text}
    </div>
  ));

  // Current typing message
  const currentMessage = currentStep && (
    <div
      className={`p-3.5 rounded-xl text-sm leading-relaxed ${
        currentStep.role === "carvis"
          ? "bg-[#FF4444]/10 border border-[#FF4444]/15 text-slate-200"
          : "bg-white/5 border border-white/10 text-slate-300 ml-6"
      }`}
    >
      {typedText}
      {!typingDone && <span className="inline-block w-1.5 h-4 bg-[#FF4444] ml-0.5 animate-pulse align-middle" />}
    </div>
  );

  const demoComplete = stepIndex >= DEMO_SCRIPT.length - 1 && typingDone;

  return (
    <div ref={containerRef} id="demo" className="max-w-5xl mx-auto">
      <div className="grid md:grid-cols-5 gap-6">
        {/* Chat panel — takes 3 cols */}
        <div className="md:col-span-3 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-5 text-left shadow-2xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-full bg-[#FF4444]/15 border border-[#FF4444]/25 flex items-center justify-center text-lg">🎓</div>
            <div>
              <div className="font-semibold text-sm">CARVIS Assistant</div>
              <div className="text-xs text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                {started ? "Connected to Canvas" : "Waiting..."}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {completedMessages}
            {currentMessage}
          </div>

          {demoComplete && (
            <div className="mt-4 pt-3 border-t border-white/10 flex items-center gap-2 text-xs text-slate-500">
              <Mic className="w-3.5 h-3.5 text-[#FF4444]" />
              <span>This was a demo — <Link href="/signin" className="text-[#FF6B3D] underline underline-offset-2">sign in</Link> to try it for real</span>
            </div>
          )}
        </div>

        {/* Mini dashboard — takes 2 cols, cards appear as demo progresses */}
        <div className="md:col-span-2 space-y-3">
          <DeadlineCard visible={revealed.has("deadlines")} />
          <GradesCard visible={revealed.has("grades")} />
          <TutorCard visible={revealed.has("tutor")} />
          <VoiceCard visible={revealed.has("voice")} />
        </div>
      </div>
    </div>
  );
}

// Inline Link to avoid import noise in this file
function Link({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}
