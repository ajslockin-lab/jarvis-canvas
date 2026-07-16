import { useState, useEffect, useRef, useMemo } from "react";
import { Mic, AlertTriangle, BookOpen, Calendar, CheckCircle2 } from "lucide-react";

/* ============================================================
   CinematicDemo v2 — auto‑play, looping, live.
   Upgrades over the original:
     • Loops forever (no dead "This was a demo" terminal state).
     • Smooth SINE equalizer on the Voice card instead of the
       jittery Math.random() + animate-pulse bars.
     • Typing‑dots indicator before each Carvis reply.
     • Role tags (CARVIS / YOU) + a live header that flips
       SYNCING… → SYNCED with a ticking session clock.
   ============================================================ */

interface DemoStep {
  role: "carvis" | "user";
  text: string;
  reveal?: "deadlines" | "grades" | "tutor" | "voice";
  /** pause after this step finishes, before the next starts */
  delay: number;
}

const DEMO_SCRIPT: DemoStep[] = [
  { role: "carvis", text: "Connected to Canvas. Pulling your courses...", delay: 800 },
  { role: "carvis", text: "Done. You have 4 assignments due this week. The ⚠️ Calc II problem set is due tomorrow at 11:59 PM.", delay: 1200, reveal: "deadlines" },
  { role: "carvis", text: "Your current grades: Physics B+, Calc II C+, English A-. The Calc II score dropped 4 points since last week.", delay: 2200, reveal: "grades" },
  { role: "user", text: "Can you help me study for the Calc II exam?", delay: 1000 },
  { role: "carvis", text: "Sure — here's a study plan. Module 4 (integration by parts) is weighted highest on the exam. Start there, then review substitution. Want me to quiz you?", delay: 1800, reveal: "tutor" },
  { role: "user", text: "Yeah quiz me on substitution.", delay: 800 },
  { role: "carvis", text: "🎤 Listening... OK: What is ∫ 2x·cos(x²) dx? Take your time.", delay: 600, reveal: "voice" },
];

const KEYFRAMES = `
@keyframes carvis-eq { 0%,100% { transform: scaleY(.18); } 50% { transform: scaleY(1); } }
@keyframes carvis-blink { 0%,49% { opacity: 1; } 50%,100% { opacity: 0; } }
@keyframes carvis-dot { 0%,100% { transform: translateY(0); opacity:.4; } 50% { transform: translateY(-4px); opacity: 1; } }
`;

/* ── mini dashboard cards ────────────────────────────────────────────── */

function RevealWrap({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  return (
    <div className={`transition-all duration-700 ease-out ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
      {children}
    </div>
  );
}

function DeadlineCard({ visible }: { visible: boolean }) {
  return (
    <RevealWrap visible={visible}>
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
    </RevealWrap>
  );
}

function GradesCard({ visible }: { visible: boolean }) {
  return (
    <RevealWrap visible={visible}>
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
    </RevealWrap>
  );
}

function TutorCard({ visible }: { visible: boolean }) {
  return (
    <RevealWrap visible={visible}>
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
    </RevealWrap>
  );
}

// Smooth SINE equalizer (CSS keyframes, staggered) — replaces the
// jittery Math.random()+animate-pulse bars.
function VoiceCard({ visible }: { visible: boolean }) {
  const bars = useMemo(
    () =>
      Array.from({ length: 12 }, () => ({
        delay: `${Math.random() * 0.4}s`,
        dur: `${0.7 + Math.random() * 0.5}s`,
      })),
    [],
  );
  return (
    <RevealWrap visible={visible}>
      <div className="hud-panel p-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full border-2 border-[#FF4444] bg-[rgba(255,30,30,0.15)] flex items-center justify-center shadow-[0_0_20px_rgba(255,68,68,0.3)] animate-pulse">
          <Mic className="w-4 h-4 text-[#FF4444]" />
        </div>
        <div>
          <div className="text-xs font-bold text-[#FF4444] tracking-wider uppercase">Voice Active</div>
          <div className="text-[10px] text-slate-500">Listening for your answer...</div>
        </div>
        <div className="ml-auto flex items-end gap-0.5 h-7">
          {bars.map((b, i) => (
            <span
              key={i}
              className="block w-0.5 rounded-full bg-[#FF4444]"
              style={{
                height: "100%",
                transformOrigin: "bottom",
                transform: "scaleY(.18)",
                animation: visible ? `carvis-eq ${b.dur} ease-in-out ${b.delay} infinite` : "none",
              }}
            />
          ))}
        </div>
      </div>
    </RevealWrap>
  );
}

/* ── main component ─────────────────────────────────────────────────── */

interface Props {
  active: boolean;
}

export default function CinematicDemo({ active }: Props) {
  const [started, setStarted] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [showDots, setShowDots] = useState(false);
  const [typing, setTyping] = useState(false);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [synced, setSynced] = useState(false);
  const [clock, setClock] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef(false);
  const timersRef = useRef<number[]>([]);

  // Start on scroll into view (or after 3s if already visible).
  useEffect(() => {
    if (!active || started) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setStarted(true);
          obs.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    if (containerRef.current) obs.observe(containerRef.current);
    const t = window.setTimeout(() => setStarted(true), 3000);
    return () => {
      obs.disconnect();
      clearTimeout(t);
    };
  }, [active, started]);

  // session clock — ticks while running
  useEffect(() => {
    if (!started) return;
    const iv = window.setInterval(() => setClock((c) => c + 1), 1000);
    return () => clearInterval(iv);
  }, [started]);

  // ── orchestration: one long-running loop, cancellable ──
  useEffect(() => {
    if (!started) return;
    cancelRef.current = false;
    const pushTimer = (h: number) => {
      timersRef.current.push(h);
      return h;
    };

    const sleep = (ms: number) =>
      new Promise<void>((res) => {
        pushTimer(window.setTimeout(res, ms));
      });

    const typeText = (text: string, speed: number) =>
      new Promise<void>((res) => {
        let i = 0;
        setTyped("");
        const iv = window.setInterval(() => {
          if (cancelRef.current) {
            clearInterval(iv);
            return;
          }
          i++;
          setTyped(text.slice(0, i));
          if (i >= text.length) {
            clearInterval(iv);
            res();
          }
        }, speed);
        pushTimer(iv as unknown as number);
      });

    (async () => {
      let idx = 0;
      while (!cancelRef.current) {
        const step = DEMO_SCRIPT[idx];
        if (!step) return;
        setStepIndex(idx);

        if (step.reveal) {
          setRevealed((prev) => new Set(prev).add(step.reveal as string));
          if (step.reveal === "deadlines") {
            pushTimer(window.setTimeout(() => setSynced(true), 800));
          }
        }

        if (step.role === "carvis") {
          setShowDots(true);
          setTyped("");
          await sleep(550);
          if (cancelRef.current) return;
          setShowDots(false);
          setTyping(true);
          await typeText(step.text, 18);
          setTyping(false);
        } else {
          setShowDots(false);
          setTyping(true);
          await typeText(step.text, 25);
          setTyping(false);
        }

        await sleep(step.delay);
        idx++;
        if (idx >= DEMO_SCRIPT.length) {
          await sleep(7600); // hold on the Voice card, then loop
          if (cancelRef.current) return;
          idx = 0;
          setStepIndex(0);
          setRevealed(new Set());
          setSynced(false);
          setTyped("");
          setShowDots(false);
          setTyping(false);
        }
      }
    })();

    return () => {
      cancelRef.current = true;
      timersRef.current.forEach((t) => {
        clearTimeout(t);
        clearInterval(t);
      });
      timersRef.current = [];
    };
  }, [started]);

  const currentStep = DEMO_SCRIPT[stepIndex];
  const completed = DEMO_SCRIPT.slice(0, stepIndex);

  const mm = String(Math.floor(clock / 60)).padStart(2, "0");
  const ss = String(clock % 60).padStart(2, "0");

  return (
    <div ref={containerRef} id="demo" className="max-w-5xl mx-auto">
      <style>{KEYFRAMES}</style>
      <div className="grid md:grid-cols-5 gap-6">
        {/* chat panel — 3 cols */}
        <div className="md:col-span-3 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-5 text-left shadow-2xl">
          {/* live header */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-full bg-[#FF4444]/15 border border-[#FF4444]/25 flex items-center justify-center text-lg">🎓</div>
            <div>
              <div className="font-semibold text-sm">CARVIS Assistant</div>
              <div className="text-xs flex items-center gap-1.5">
                {started ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className={synced ? "text-emerald-400" : "text-[#FF6B3D]"}>
                      {synced ? `SYNCED · ${mm}:${ss}` : "SYNCING…"}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                    <span className="text-slate-500">Waiting…</span>
                  </>
                )}
              </div>
            </div>
            <div className="ml-auto flex items-center gap-1.5 text-[10px] font-mono tracking-wider text-red-400/80">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FF4444] shadow-[0_0_8px_#FF4444] animate-pulse" />
              LIVE
            </div>
          </div>

          <div className="space-y-3">
            {completed.map((s, i) => (
              <div key={i}>
                <div className={`text-[9px] font-mono tracking-widest mb-1 ${s.role === "carvis" ? "text-[#FF4444]" : "text-slate-500 text-right"}`}>
                  {s.role === "carvis" ? "CARVIS" : "YOU"}
                </div>
                <div className={`p-3.5 rounded-xl text-sm leading-relaxed ${s.role === "carvis" ? "bg-[#FF4444]/10 border border-[#FF4444]/15 text-slate-200" : "bg-white/5 border border-white/10 text-slate-300 ml-6"}`}>
                  {s.text}
                </div>
              </div>
            ))}

            {currentStep && (
              <div>
                <div className={`text-[9px] font-mono tracking-widest mb-1 ${currentStep.role === "carvis" ? "text-[#FF4444]" : "text-slate-500 text-right"}`}>
                  {currentStep.role === "carvis" ? "CARVIS" : "YOU"}
                </div>
                {showDots ? (
                  <div className="p-3.5 rounded-xl bg-[#FF4444]/10 border border-[#FF4444]/15 text-slate-200 inline-flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#FF4444]" style={{ animation: "carvis-dot 1.2s ease-in-out infinite", animationDelay: "0s" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-[#FF4444]" style={{ animation: "carvis-dot 1.2s ease-in-out infinite", animationDelay: ".18s" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-[#FF4444]" style={{ animation: "carvis-dot 1.2s ease-in-out infinite", animationDelay: ".36s" }} />
                  </div>
                ) : (
                  <div className={`p-3.5 rounded-xl text-sm leading-relaxed ${currentStep.role === "carvis" ? "bg-[#FF4444]/10 border border-[#FF4444]/15 text-slate-200" : "bg-white/5 border border-white/10 text-slate-300 ml-6"}`}>
                    {typed}
                    {typing && <span className="inline-block w-1.5 h-4 bg-[#FF4444] ml-0.5 align-middle" style={{ animation: "carvis-blink 1s steps(1) infinite" }} />}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-white/10 flex items-center gap-2 text-xs text-slate-500">
            <Mic className="w-3.5 h-3.5 text-[#FF4444]" />
            <span>replaying a live session — <a href="/signin" className="text-[#FF6B3D] underline underline-offset-2">sign in</a> to try it for real</span>
          </div>
        </div>

        {/* mini dashboard — 2 cols */}
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
