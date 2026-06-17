import { useState, useEffect, useCallback } from "react";
import { Mic, X, Sparkles, Loader2, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from "lucide-react";

const SESSION_KEY = "jarvis_session_token";

interface Assignment {
  id: string;
  name: string;
  dueDate: string | null;
  url: string | null;
  course?: { name: string };
  courseName?: string;
}

interface Course {
  id: string;
  name: string;
  assignments: Assignment[];
}

interface Grade {
  name: string;
  percent: number;
}

export default function ExtensionOverlay() {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [mounted, setMounted] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(SESSION_KEY);
    if (stored) setSessionToken(stored);

    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get("session_token");
    if (tokenParam) {
      setSessionToken(tokenParam);
      localStorage.setItem(SESSION_KEY, tokenParam);
    }

    const channel = new BroadcastChannel("jarvis-auth");
    channel.onmessage = (event) => {
      if (event.data?.type === "auth-success" && event.data.sessionToken) {
        setSessionToken(event.data.sessionToken);
        localStorage.setItem(SESSION_KEY, event.data.sessionToken);
      }
    };
    return () => channel.close();
  }, []);

  const authHeaders = useCallback((): Record<string, string> => {
    if (!sessionToken) return {};
    return { "X-Session-Token": sessionToken };
  }, [sessionToken]);

  useEffect(() => {
    if (!mounted) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setPos({ x: w - 420 - 16, y: h / 2 - 320 });
      setMounted(true);
    }
  }, [mounted]);

  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [courses, setCourses] = useState<Course[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiResponse, setAiResponse] = useState("");
  const [transcript, setTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [calDate, setCalDate] = useState(new Date());
  const [showCalendar, setShowCalendar] = useState(true);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [authed, setAuthed] = useState(false);

  const fetchData = useCallback(() => {
    setLoading(true);
    const headers = authHeaders();
    fetch("/api/user/data", { headers, credentials: "include" })
      .then((r) => { if (r.status === 401) { setAuthed(false); return null; } setAuthed(true); return r.json(); })
      .then((data) => {
        if (!data) return;
        setCourses(Array.isArray(data.courses) ? data.courses as Course[] : []);
      })
      .catch(() => setCourses([]))
      .finally(() => setLoading(false));

    fetch("/api/canvas/grades", { headers, credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.grades)) {
          setGrades(data.grades.map((g: { name: string; currentScore: number | null }) => ({ name: g.name, percent: g.currentScore ?? 0 })));
        }
      })
      .catch(() => setGrades([]));
  }, [authHeaders]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { if (sessionToken) fetchData(); }, [sessionToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setDragOffset({ x: e.clientX - pos.x, y: e.clientY - pos.y });
    setDragging(true);
  }, [pos]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => { if (!dragging) return; setPos({ x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y }); };
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [dragging, dragOffset]);

  const now = new Date();
  const allAssignments = courses
    .flatMap((c) => c.assignments.map((a) => ({ ...a, courseName: c.name })))
    .filter((a) => a.dueDate && new Date(a.dueDate) >= new Date(now.getFullYear(), now.getMonth(), now.getDate()))
    .sort((a, b) => (a.dueDate ? new Date(a.dueDate).getTime() : 0) - (b.dueDate ? new Date(b.dueDate).getTime() : 0));

  const topAssignments = allAssignments.slice(0, 5);
  const startOfMonth = new Date(calDate.getFullYear(), calDate.getMonth(), 1);
  const startDay = startOfMonth.getDay();
  const daysInMonth = new Date(calDate.getFullYear(), calDate.getMonth() + 1, 0).getDate();
  const days: (number | null)[] = Array(startDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);
  const dayNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  const getAssignmentsForDay = (day: number) => allAssignments.filter((a) => {
    if (!a.dueDate) return false;
    const d = new Date(a.dueDate);
    return d.getDate() === day && d.getMonth() === calDate.getMonth() && d.getFullYear() === calDate.getFullYear();
  });

  const sendToAI = async (textPrompt: string) => {
    setIsSending(true);
    try {
      const res = await fetch("/api/voice/command", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        credentials: "include",
        body: JSON.stringify({ text: textPrompt }),
      });
      const data = await res.json();
      setAiResponse(data.response || "No response.");
    } catch {
      setAiResponse("Error connecting to JARVIS.");
    } finally {
      setIsSending(false);
    }
  };

  const toggleVoice = () => {
    if (isListening) { setIsListening(false); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechAPI) { setAiResponse("Voice not supported in this browser."); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec = new SpeechAPI() as any;
    rec.continuous = false;
    rec.interimResults = true;
    rec.onstart = () => setIsListening(true);
    rec.onend = () => setIsListening(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (event: any) => {
      let t = "";
      for (let i = 0; i < event.results.length; i++) t += event.results[i][0].transcript;
      setTranscript(t.trim());
      if (event.results[event.results.length - 1].isFinal) sendToAI(t.trim());
    };
    rec.start();
  };

  const close = () => { if (window.parent !== window) window.parent.postMessage("jarvis-close", "*"); };
  const panel = "rounded-xl border border-cyan-400/30 bg-[#0B1B3D]/80 backdrop-blur-md shadow-[0_0_20px_rgba(6,182,212,0.15)]";
  const selectedDayAssignments = selectedDay ? getAssignmentsForDay(selectedDay) : [];

  if (!authed && !loading) {
    const handleConnect = () => {
      window.open("/signin", "_blank");
      const interval = setInterval(() => {
        const token = localStorage.getItem(SESSION_KEY);
        const headers: Record<string, string> = token ? { "X-Session-Token": token } : {};
        fetch("/api/user/data", { headers, credentials: "include" })
          .then((r) => { if (r.status !== 401) { clearInterval(interval); fetchData(); } })
          .catch(() => {});
      }, 2000);
      setTimeout(() => clearInterval(interval), 300000);
    };

    return (
      <div className="min-h-screen w-full flex items-center justify-center">
        <div className={`fixed w-[380px] ${panel} p-6 text-center`}>
          <div className="flex items-center justify-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-cyan-400" />
            <span className="text-sm font-bold text-cyan-300 tracking-wider">JARVIS</span>
          </div>
          <p className="text-sm text-cyan-300/70 mb-4">Sign in to access your Canvas data</p>
          <button onClick={handleConnect} className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 text-sm font-bold rounded hover:bg-cyan-500/30 transition">
            CONNECT CANVAS
          </button>
          <p className="text-[10px] text-cyan-300/40 mt-3">Opens in a new tab — this panel will auto-refresh</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full">
      <div className={`fixed w-[420px] ${panel} overflow-hidden transition-opacity duration-300 ${mounted ? "opacity-100" : "opacity-0"}`} style={{ left: pos.x, top: pos.y }}>
        <div className="cursor-move px-4 py-3 flex items-center justify-between bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border-b border-cyan-400/20" onMouseDown={handleMouseDown}>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-bold text-cyan-300 tracking-wider">JARVIS</span>
          </div>
          <button onClick={close} className="text-cyan-300 hover:text-white transition"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 space-y-4 max-h-[80vh] overflow-y-auto">
          <div className={panel + " p-3"}>
            <button onClick={() => setShowCalendar(!showCalendar)} className="w-full flex items-center justify-between mb-1 hover:text-cyan-100 transition-colors">
              <span className="text-sm font-bold text-cyan-300">{calDate.toLocaleString("en-US", { month: "long", year: "numeric" })}</span>
              {showCalendar ? <ChevronUp className="w-4 h-4 text-cyan-400" /> : <ChevronDown className="w-4 h-4 text-cyan-400" />}
            </button>
            <div className={`overflow-hidden transition-all duration-300 ${showCalendar ? "max-h-[400px] opacity-100" : "max-h-0 opacity-0"}`}>
              <div className="flex items-center justify-between mb-2">
                <button onClick={() => setCalDate(new Date(calDate.getFullYear(), calDate.getMonth() - 1))} className="text-cyan-400 hover:text-cyan-200"><ChevronLeft className="w-4 h-4" /></button>
                <span className="text-xs font-semibold text-cyan-300/70">{calDate.toLocaleString("en-US", { month: "long", year: "numeric" })}</span>
                <button onClick={() => setCalDate(new Date(calDate.getFullYear(), calDate.getMonth() + 1))} className="text-cyan-400 hover:text-cyan-200"><ChevronRight className="w-4 h-4" /></button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-[11px] mb-1">
                {dayNames.map((d) => <span key={d} className="text-cyan-300/50">{d}</span>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {days.map((day, i) => {
                  const dayAssignments = day ? getAssignmentsForDay(day) : [];
                  const hasAssignments = dayAssignments.length > 0;
                  const isToday = day && day === now.getDate() && calDate.getMonth() === now.getMonth();
                  const isSelected = selectedDay === day;
                  return (
                    <button key={i} onClick={() => { if (!day) return; setSelectedDay(selectedDay === day ? null : day); }}
                      className={`relative h-8 flex items-center justify-center text-sm rounded transition ${isSelected ? "ring-2 ring-cyan-400" : ""} ${isToday ? "bg-cyan-500/30 border border-cyan-400/50 font-bold text-white" : hasAssignments ? "text-cyan-300 font-bold hover:bg-cyan-500/10 cursor-pointer" : "text-cyan-300/40"}`}>
                      {day || ""}
                      {hasAssignments && <div className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(6,182,212,0.8)]" />}
                    </button>
                  );
                })}
              </div>
              {selectedDayAssignments.length > 0 && (
                <div className="mt-3 pt-3 border-t border-cyan-400/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-cyan-200">{calDate.toLocaleString("en-US", { month: "short" })} {selectedDay}</h4>
                    <button onClick={() => setSelectedDay(null)} className="text-[10px] text-cyan-400 hover:text-white">Close</button>
                  </div>
                  {selectedDayAssignments.map((a) => (
                    <a key={a.id} href={a.url || "#"} target="_blank" rel="noopener noreferrer" className="block p-2 rounded border border-cyan-400/20 bg-cyan-950/30 hover:border-cyan-400/40 transition">
                      <p className="text-xs font-semibold text-cyan-100">{a.name}</p>
                      <p className="text-[10px] text-cyan-300/50">{a.courseName}</p>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-[10px] uppercase tracking-widest mb-2 text-cyan-300/50">Upcoming Deadlines</h3>
            {loading ? (
              <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-10 rounded bg-cyan-500/10 animate-pulse" />)}</div>
            ) : topAssignments.length > 0 ? (
              <div className="space-y-2">
                {topAssignments.map((a) => {
                  const hours = a.dueDate ? Math.ceil((new Date(a.dueDate).getTime() - now.getTime()) / (1000 * 60 * 60)) : null;
                  const isOverdue = hours !== null && hours < 0;
                  const isUrgent = hours !== null && hours >= 0 && hours < 24;
                  return (
                    <a key={a.id} href={a.url || "#"} target="_blank" rel="noopener noreferrer"
                      className={`block p-2 rounded border hover:border-cyan-400/40 transition ${isOverdue ? "border-red-400/30 bg-red-950/20" : isUrgent ? "border-amber-400/30 bg-amber-950/20" : "border-cyan-400/20 bg-cyan-950/30"}`}>
                      <p className="text-xs font-semibold text-cyan-100">{a.name}</p>
                      <p className="text-[10px] text-cyan-300/50">{a.courseName}</p>
                      <span className={`text-[10px] font-mono ${isOverdue ? "text-red-400" : isUrgent ? "text-amber-400" : "text-cyan-300"}`}>
                        {isOverdue ? `OVERDUE ${Math.abs(hours!)}h` : isUrgent ? `${hours}h left` : a.dueDate ? new Date(a.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}
                      </span>
                    </a>
                  );
                })}
              </div>
            ) : <p className="text-sm text-cyan-300/50">No upcoming deadlines</p>}
          </div>

          <div>
            <h3 className="text-[10px] uppercase tracking-widest mb-2 text-cyan-300/50">Grades</h3>
            {grades.length > 0 ? (
              grades.map((g) => (
                <div key={g.name} className="mb-2">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-cyan-200">{g.name}</span>
                    <span className={`font-bold ${g.percent >= 85 ? "text-green-400" : g.percent >= 70 ? "text-amber-400" : "text-red-400"}`}>{g.percent}%</span>
                  </div>
                  <div className="h-2 w-full bg-white/10 rounded-full">
                    <div className={`h-full rounded-full ${g.percent >= 85 ? "bg-gradient-to-r from-green-400 to-emerald-400" : g.percent >= 70 ? "bg-gradient-to-r from-amber-400 to-yellow-400" : "bg-gradient-to-r from-red-400 to-rose-400"}`} style={{ width: `${g.percent}%` }} />
                  </div>
                </div>
              ))
            ) : <p className="text-[11px] text-cyan-300/50">Connect Canvas to see grades</p>}
          </div>

          <div className="flex items-center gap-3 pt-2 border-t border-cyan-400/20">
            <button onClick={toggleVoice} disabled={isSending}
              className={`w-10 h-10 rounded-full flex items-center justify-center border transition shrink-0 ${isListening ? "border-red-400 bg-red-500/10" : "border-cyan-400/40 bg-cyan-500/10 hover:bg-cyan-500/20"}`}>
              {isSending ? <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" /> : isListening ? <Mic className="w-4 h-4 text-red-400" /> : <Mic className="w-4 h-4 text-cyan-400" />}
            </button>
            <div className="flex-1 min-w-0">
              {transcript && <p className="text-xs text-cyan-300/60">{transcript}</p>}
              {aiResponse && <p className="text-sm text-cyan-100">{aiResponse}</p>}
              {!transcript && !aiResponse && <p className="text-xs text-cyan-300/50">Tap to speak</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
