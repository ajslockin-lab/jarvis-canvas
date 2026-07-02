import { useState, useEffect, useCallback, useRef } from "react";
import { Mic, X, Sparkles, Loader2, ChevronLeft, ChevronRight, Zap, MousePointer, ArrowDown, ArrowUp, Navigation, Eye, Cpu, Volume2, VolumeX } from "lucide-react";

const SESSION_KEY = "jarvis_session_token";

// API_BASE is empty = relative URLs (same-origin). If API runs on a different domain,
// set this to the API origin (e.g. "https://api.carvis.app") via env or config.
const API_BASE = "";

interface Assignment {
  id: string;
  name: string;
  dueDate: string | null;
  url: string | null;
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
  letterGrade?: string | null;
}

interface AgentAction {
  type: "click" | "fill" | "scroll" | "navigate";
  elementId?: string;
  value?: string;
  direction?: "up" | "down";
  url?: string;
}
type AgentAction2 =
  | { type: "click"; elementId: string }
  | { type: "fill"; elementId: string; value: string }
  | { type: "scroll"; direction: "up" | "down" }
  | { type: "navigate"; url: string }
  | { type: "keypress"; elementId: string; key: string }
  | { type: "select"; elementId: string; value: string };

interface AgentPlan {
  response: string;
  action?: AgentAction;
  blocked?: boolean;
}
type AgentPlan2 = { response: string; action?: AgentAction2 | AgentAction2[]; blocked?: boolean };

type Tab = "intel" | "agent" | "data";

export default function ExtensionOverlay() {
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<Course[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [tab, setTab] = useState<Tab>("intel");
  const [collapsed, setCollapsed] = useState(false);

  // Agentic state
  const [agentInput, setAgentInput] = useState("");
  const [agentHistory, setAgentHistory] = useState<{ role: "user" | "jarvis"; text: string; action?: AgentAction; blocked?: boolean }[]>([]);
  const [agentLoading, setAgentLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [pageContext, setPageContext] = useState<{ url: string; title: string; elements: unknown[] } | null>(null);
  const [lastAction, setLastAction] = useState<{ type: string; label: string } | null>(null);

  // Calendar
  const [calDate, setCalDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);

  const applySession = useCallback((token: string) => {
    setSessionToken(token);
    localStorage.setItem(SESSION_KEY, token);
    if (window.parent !== window) {
      window.parent.postMessage({ type: "carvis-store-session", sessionToken: token }, "*");
    }
  }, []);

  const handleConnect = useCallback(() => {
    setConnecting(true);
    const signinUrl = `${window.location.origin}/signin?from=extension`;
    const popup = window.open(signinUrl, "carvis-signin", "width=480,height=720");

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "jarvis-auth-success" && event.data.sessionToken) {
        applySession(event.data.sessionToken);
        setConnecting(false);
        window.removeEventListener("message", onMessage);
        popup?.close();
      }
    };

    window.addEventListener("message", onMessage);

    const poll = window.setInterval(() => {
      if (popup?.closed) {
        window.clearInterval(poll);
        setConnecting(false);
        window.removeEventListener("message", onMessage);
      }
    }, 1000);
  }, [applySession]);

  const closePanel = useCallback(() => {
    if (window.parent !== window) {
      window.parent.postMessage({ type: "jarvis-close" }, "*");
      return;
    }
    setCollapsed(true);
  }, []);

  const historyEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const stored = localStorage.getItem(SESSION_KEY);
    if (stored) setSessionToken(stored);

    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get("session_token");
    if (tokenParam) {
      applySession(tokenParam);
    }

    const channel = new BroadcastChannel("jarvis-auth");
    channel.onmessage = (e) => {
      if (e.data?.type === "auth-success" && e.data.sessionToken) {
        applySession(e.data.sessionToken);
      }
    };
    return () => channel.close();
  }, [applySession]);

  // Listen for page context from parent (Canvas content script)
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === "jarvis-context") {
        setPageContext({ url: e.data.url, title: e.data.title, elements: e.data.elements || [] });
      } else if (e.data?.type === "jarvis-context-delta") {
        // Parent saw DOM change. Refresh the snapshot so the next agent
        // command sees the up-to-date view. Cheap — small payload.
        if (window.parent !== window) {
          window.parent.postMessage({ type: "jarvis-get-context" }, "*");
        }
      } else if (e.data?.type === "jarvis-read-element-result") {
        // Surface read targets in history so the user sees what the agent inspected.
        const preview = e.data?.text ? e.data.text.slice(0, 220) : "(empty)";
        setAgentHistory((h) => [
          ...h,
          { role: "jarvis", text: `📄 read element ${e.data.elementId}: ${preview}${e.data?.text && e.data.text.length > 220 ? "…" : ""}`, action: undefined, blocked: false },
        ]);
      } else if (e.data?.type === "jarvis-read-selection-result") {
        const sel = (e.data?.text ?? "").trim();
        setAgentHistory((h) => [
          ...h,
          { role: "jarvis", text: sel ? `📝 selection: "${sel.slice(0, 220)}"` : "(no selection)" },
        ]);
      }
    };
    window.addEventListener("message", handleMessage);
    if (window.parent === window) {
      setPageContext({ url: window.location.href, title: document.title, elements: [] });
    }
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Request context from parent on open and when agent tab is active
  useEffect(() => {
    const requestContext = () => {
      if (window.parent !== window) {
        window.parent.postMessage({ type: "jarvis-get-context" }, "*");
      }
    };
    requestContext();
    const interval = setInterval(requestContext, 8000);
    return () => clearInterval(interval);
  }, [tab]);

  const authHeaders = useCallback((): Record<string, string> => {
    if (!sessionToken) return {};
    return { "X-Session-Token": sessionToken };
  }, [sessionToken]);

  const fetchData = useCallback(() => {
    setLoading(true);
    const h = { ...authHeaders() };
    fetch(`${API_BASE}/api/user/data`, { headers: h, credentials: "include" })
      .then((r) => { if (r.status === 401) { setAuthed(false); return null; } setAuthed(true); return r.json(); })
      .then((data) => { if (data) setCourses(Array.isArray(data.courses) ? data.courses : []); })
      .catch(() => setCourses([]))
      .finally(() => setLoading(false));

    fetch(`${API_BASE}/api/canvas/grades`, { headers: h, credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.grades) setGrades(data.grades.map((g: { name: string; currentScore: number | null; letterGrade?: string | null }) => ({ name: g.name, percent: g.currentScore ?? 0, letterGrade: g.letterGrade })));
      })
      .catch(() => {});
  }, [authHeaders]);

  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [agentHistory]);

  const now = new Date();
  const allAssignments = courses
    .flatMap((c) => c.assignments.map((a) => ({ ...a, courseName: c.name })))
    .filter((a) => a.dueDate && new Date(a.dueDate) >= new Date(now.getFullYear(), now.getMonth(), now.getDate()))
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());

  const speak = useCallback((text: string) => {
    if (!ttsEnabled || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 0.9;
    window.speechSynthesis.speak(utterance);
  }, [ttsEnabled]);

  const executeAgentAction = useCallback((action: AgentAction) => {
    if (window.parent === window) {
      // Standalone preview — simulate
      const labels: Record<string, string> = { scroll: `scroll ${action.direction}`, click: "click element", fill: `type "${action.value}"`, navigate: `go to ${action.url}` };
      setLastAction({ type: action.type, label: labels[action.type] || action.type });
      return;
    }
    window.parent.postMessage({ type: "jarvis-action", action }, "*");
    const labels: Record<string, string> = { scroll: `Scrolled ${action.direction}`, click: "Clicked element", fill: `Typed text`, navigate: `Navigated` };
    setLastAction({ type: action.type, label: labels[action.type] || action.type });
  }, []);

  const sendAgentCommand = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || agentLoading) return;
    setAgentInput("");
    setAgentHistory((h) => [...h, { role: "user", text: trimmed }]);
    setAgentLoading(true);

    try {
      const ctx = pageContext || { url: window.location.href, title: document.title, elements: [] };
      const res = await fetch(`${API_BASE}/api/extension/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        credentials: "include",
        body: JSON.stringify({ command: trimmed, pageContext: ctx }),
      });
      const data: AgentPlan = await res.json();
      setAgentHistory((h) => [...h, { role: "jarvis", text: data.response, action: data.action, blocked: data.blocked }]);
      speak(data.response);
      if (data.action && !data.blocked) {
        const actions = Array.isArray(data.action) ? data.action : [data.action];
        for (const a of actions) executeAgentAction(a as AgentAction);
      }
    } catch {
      const errMsg = "Connection error — CARVIS offline.";
      setAgentHistory((h) => [...h, { role: "jarvis", text: errMsg }]);
      speak(errMsg);
    } finally {
      setAgentLoading(false);
    }
  }, [agentLoading, authHeaders, executeAgentAction, pageContext]);

  const toggleVoice = () => {
    if (isListening || recognitionRef.current) {
      recognitionRef.current?.stop?.();
      recognitionRef.current = null;
      setIsListening(false);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechAPI) { setAgentHistory((h) => [...h, { role: "jarvis", text: "Voice not supported in this browser." }]); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec = new SpeechAPI() as any;
    recognitionRef.current = rec;
    rec.continuous = false;
    rec.interimResults = false;
    rec.onstart = () => setIsListening(true);
    rec.onend = () => { setIsListening(false); recognitionRef.current = null; };
    rec.onerror = () => { setIsListening(false); recognitionRef.current = null; };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (event: any) => {
      const t = event.results[0][0].transcript;
      setTab("agent");
      void sendAgentCommand(t);
    };
    rec.start();
    setTab("agent");
  };

  // Calendar helpers
  const startOfMonth = new Date(calDate.getFullYear(), calDate.getMonth(), 1);
  const startDay = startOfMonth.getDay();
  const daysInMonth = new Date(calDate.getFullYear(), calDate.getMonth() + 1, 0).getDate();
  const days: (number | null)[] = Array(startDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);
  const dayNames = ["S", "M", "T", "W", "T", "F", "S"];

  const getAssignmentsForDay = (day: number) => allAssignments.filter((a) => {
    if (!a.dueDate) return false;
    const d = new Date(a.dueDate);
    return d.getDate() === day && d.getMonth() === calDate.getMonth() && d.getFullYear() === calDate.getFullYear();
  });

  if (!authed && !loading) {
    return (
      <div className="pointer-events-none min-h-screen flex items-start justify-end p-3">
        <div className="pointer-events-auto w-72 rounded-xl border border-[rgba(160,21,21,0.35)] bg-black/95 backdrop-blur-xl shadow-[0_0_30px_rgba(255,30,30,0.15)] p-5 text-center">
          <div className="w-10 h-10 mx-auto mb-3 rounded-full border border-[rgba(255,68,68,0.4)] bg-[rgba(255,30,30,0.08)] flex items-center justify-center">
            <img src="/carvis-logo.png" alt="" className="h-6 w-6 object-contain" />
          </div>
          <p className="font-orbitron text-xs font-bold tracking-[0.15em] text-[#FF4444] mb-1">CARVIS OFFLINE</p>
          <p className="text-[11px] text-[rgba(245,245,245,0.45)] mb-4">Sign in to activate Canvas intelligence</p>
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[rgba(255,30,30,0.12)] border border-[rgba(255,68,68,0.35)] text-[#FF4444] text-xs font-bold tracking-wider rounded-lg hover:bg-[rgba(255,30,30,0.2)] transition disabled:opacity-60"
          >
            {connecting ? (
              <><Loader2 className="w-3 h-3 animate-spin" /> WAITING FOR SIGN IN...</>
            ) : (
              <><Zap className="w-3 h-3" /> CONNECT CANVAS</>
            )}
          </button>
        </div>
      </div>
    );
  }

  if (collapsed) {
    return (
      <div className="pointer-events-none min-h-screen flex items-start justify-end p-3">
        <button
          onClick={() => setCollapsed(false)}
          className="pointer-events-auto group w-12 h-12 rounded-full border border-[rgba(255,68,68,0.5)] bg-black/95 backdrop-blur-xl shadow-[0_0_20px_rgba(255,30,30,0.25)] flex items-center justify-center transition hover:shadow-[0_0_30px_rgba(255,68,68,0.4)] hover:border-[#FF4444]"
        >
          <Sparkles className="w-5 h-5 text-[#FF4444] group-hover:text-[#ff6b3d] transition" />
        </button>
      </div>
    );
  }

  const actionIconMap: Record<string, React.ReactNode> = {
    scroll: <ArrowDown className="w-3 h-3" />,
    click: <MousePointer className="w-3 h-3" />,
    navigate: <Navigation className="w-3 h-3" />,
    fill: <Cpu className="w-3 h-3" />,
  };

  return (
    <div className="pointer-events-none min-h-screen flex items-start justify-end p-3">
      <div className="pointer-events-auto w-[360px] rounded-2xl border border-[rgba(160,21,21,0.3)] bg-black/97 backdrop-blur-xl shadow-[0_0_40px_rgba(255,30,30,0.12),inset_0_1px_0_rgba(255,68,68,0.08)] overflow-hidden">

        {/* Header */}
        <div className="px-4 py-3 flex items-center justify-between border-b border-[rgba(160,21,21,0.18)] bg-gradient-to-r from-[rgba(255,30,30,0.06)] to-transparent">
          <div className="flex items-center gap-2.5">
            <div className="relative w-7 h-7 rounded-full border border-[rgba(255,68,68,0.45)] bg-[rgba(255,30,30,0.1)] flex items-center justify-center">
              <img src="/carvis-logo.png" alt="" className="h-4 w-4 object-contain" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#FF4444] shadow-[0_0_6px_rgba(255,68,68,0.55)]" />
            </div>
            <div>
              <p className="font-orbitron text-[11px] font-bold tracking-[0.15em] text-[#FF4444]">CARVIS</p>
              <p className="text-[9px] text-[rgba(255,68,68,0.5)] tracking-wider">CANVAS AGENT // ONLINE</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {lastAction && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-[rgba(160,21,21,0.22)] bg-[rgba(255,30,30,0.1)] text-[9px] text-[rgba(255,68,68,0.75)] font-mono">
                {actionIconMap[lastAction.type]}
                {lastAction.label}
              </span>
            )}
            <button onClick={toggleVoice} title="Voice command"
              className={`w-7 h-7 rounded-full border flex items-center justify-center transition ${isListening ? "border-red-400/60 bg-red-500/10 text-red-400" : "border-[rgba(255,68,68,0.3)] bg-[rgba(255,30,30,0.06)] text-[rgba(255,68,68,0.7)] hover:text-[#FF4444] hover:border-[rgba(255,68,68,0.5)]"}`}>
              <Mic className="w-3.5 h-3.5" />
            </button>
            <button onClick={closePanel} className="w-7 h-7 rounded-full border border-[rgba(160,21,21,0.25)] flex items-center justify-center text-[rgba(255,68,68,0.5)] hover:text-[#FF4444] hover:border-[#FF4444]/40 transition">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[rgba(160,21,21,0.14)]">
          {([["intel", "INTEL", <Eye key="e" className="w-3 h-3" />], ["agent", "AGENT", <Cpu key="c" className="w-3 h-3" />], ["data", "DATA", <Zap key="z" className="w-3 h-3" />]] as [Tab, string, React.ReactNode][]).map(([id, label, icon]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[10px] font-bold tracking-[0.1em] transition border-b-2 ${tab === id ? "text-[#FF4444] border-[#FF4444] bg-[rgba(255,30,30,0.08)]" : "text-[rgba(255,68,68,0.4)] border-transparent hover:text-[rgba(255,68,68,0.75)] hover:bg-[rgba(255,30,30,0.05)]"}`}>
              {icon}{label}
            </button>
          ))}
        </div>

        {/* Panel content */}
        <div className="max-h-[520px] overflow-y-auto scrollbar-thin">

          {/* INTEL TAB */}
          {tab === "intel" && (
            <div className="p-3 space-y-3">
              {/* Calendar */}
              <div className="rounded-xl border border-[rgba(160,21,21,0.22)] bg-[rgba(255,30,30,0.05)] p-3">
                <div className="flex items-center justify-between mb-2.5">
                  <button onClick={() => setCalDate(new Date(calDate.getFullYear(), calDate.getMonth() - 1))} className="text-[rgba(255,68,68,0.5)] hover:text-[#FF4444] transition"><ChevronLeft className="w-3.5 h-3.5" /></button>
                  <span className="font-orbitron text-[10px] font-bold tracking-widest text-[rgba(255,68,68,0.75)]">
                    {calDate.toLocaleString("en-US", { month: "short", year: "numeric" }).toUpperCase()}
                  </span>
                  <button onClick={() => setCalDate(new Date(calDate.getFullYear(), calDate.getMonth() + 1))} className="text-[rgba(255,68,68,0.5)] hover:text-[#FF4444] transition"><ChevronRight className="w-3.5 h-3.5" /></button>
                </div>
                <div className="grid grid-cols-7 gap-0.5 text-center mb-1">
                  {dayNames.map((d, i) => <span key={i} className="text-[9px] text-[rgba(255,68,68,0.35)] font-bold">{d}</span>)}
                </div>
                <div className="grid grid-cols-7 gap-0.5">
                  {days.map((day, i) => {
                    const dayA = day ? getAssignmentsForDay(day) : [];
                    const hasA = dayA.length > 0;
                    const isToday = day === now.getDate() && calDate.getMonth() === now.getMonth() && calDate.getFullYear() === now.getFullYear();
                    const isSel = selectedDay === day;
                    return (
                      <button key={i} onClick={() => day && setSelectedDay(isSel ? null : day)}
                        className={`h-7 flex items-center justify-center rounded text-[11px] relative transition ${!day ? "cursor-default" : ""} ${isToday ? "bg-[rgba(255,30,30,0.18)] border border-[rgba(255,68,68,0.45)] text-white font-bold" : isSel ? "ring-1 ring-[#FF4444] text-[#f5f5f5]" : hasA ? "text-[#FF4444] font-semibold hover:bg-[rgba(255,30,30,0.08)]" : "text-[rgba(255,68,68,0.3)]"}`}>
                        {day || ""}
                        {hasA && <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#FF4444]/80" />}
                      </button>
                    );
                  })}
                </div>
                {selectedDay && getAssignmentsForDay(selectedDay).length > 0 && (
                  <div className="mt-2 pt-2 border-t border-[rgba(160,21,21,0.14)] space-y-1.5">
                    {getAssignmentsForDay(selectedDay).map((a) => (
                      <a key={a.id} href={a.url || "#"} target="_blank" rel="noopener noreferrer"
                        className="flex items-start gap-2 p-1.5 rounded border border-[rgba(160,21,21,0.18)] hover:border-[rgba(255,68,68,0.35)] transition">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#FF4444] mt-1 shrink-0" />
                        <div>
                          <p className="text-[11px] font-semibold text-[#f5f5f5] leading-tight">{a.name}</p>
                          <p className="text-[9px] text-[rgba(255,68,68,0.5)]">{a.courseName}</p>
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </div>

              {/* Upcoming */}
              <div>
                <p className="text-[9px] font-bold tracking-[0.15em] text-[rgba(255,68,68,0.4)] mb-2 uppercase">Upcoming Targets</p>
                {loading ? (
                  <div className="space-y-1.5">{[1,2,3].map(i => <div key={i} className="h-9 rounded-lg bg-[rgba(255,30,30,0.06)] animate-pulse" />)}</div>
                ) : allAssignments.slice(0, 4).length > 0 ? (
                  <div className="space-y-1.5">
                    {allAssignments.slice(0, 4).map((a) => {
                      const hours = a.dueDate ? Math.ceil((new Date(a.dueDate).getTime() - now.getTime()) / 3600000) : null;
                      const urgent = hours !== null && hours < 24;
                      const overdue = hours !== null && hours < 0;
                      return (
                        <a key={a.id} href={a.url || "#"} target="_blank" rel="noopener noreferrer"
                          className={`flex items-center gap-2.5 p-2 rounded-lg border transition ${overdue ? "border-red-400/25 bg-red-950/20" : urgent ? "border-amber-400/25 bg-amber-950/20" : "border-[rgba(160,21,21,0.18)] bg-[rgba(255,30,30,0.04)] hover:border-[rgba(255,68,68,0.35)]"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${overdue ? "bg-red-400" : urgent ? "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]" : "bg-[#FF4444]/50"}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-semibold text-[#f5f5f5] truncate">{a.name}</p>
                            <p className="text-[9px] text-[rgba(255,68,68,0.5)] truncate">{a.courseName}</p>
                          </div>
                          <span className={`text-[9px] font-mono shrink-0 ${overdue ? "text-red-400" : urgent ? "text-amber-400" : "text-[rgba(255,68,68,0.55)]"}`}>
                            {overdue ? `${Math.abs(hours!)}h OD` : urgent ? `${hours}h` : a.dueDate ? new Date(a.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}
                          </span>
                        </a>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[11px] text-[rgba(255,68,68,0.4)] text-center py-3">All clear — no upcoming deadlines</p>
                )}
              </div>
            </div>
          )}

          {/* AGENT TAB */}
          {tab === "agent" && (
            <div className="flex flex-col h-[460px]">
              {/* Context bar */}
              <div className="px-3 py-1.5 border-b border-[rgba(160,21,21,0.14)] flex items-center gap-1.5">
                {pageContext && (
                  <>
                    <Eye className="w-3 h-3 text-[rgba(255,68,68,0.4)] shrink-0" />
                    <span className="text-[9px] text-[rgba(255,68,68,0.5)] truncate font-mono flex-1">{pageContext.title || pageContext.url}</span>
                  </>
                )}
                {!pageContext && <span className="flex-1" />}
                <button
                  onClick={() => { setTtsEnabled((v) => !v); if (ttsEnabled) window.speechSynthesis?.cancel(); }}
                  title={ttsEnabled ? "Mute CARVIS voice" : "Unmute CARVIS voice"}
                  className={`w-6 h-6 rounded flex items-center justify-center border transition shrink-0 ${ttsEnabled ? "border-[rgba(255,68,68,0.4)] bg-[rgba(255,30,30,0.1)] text-[rgba(255,68,68,0.65)]" : "border-[rgba(160,21,21,0.18)] text-[rgba(255,68,68,0.35)] hover:text-[#FF4444]/50"}`}
                >
                  {ttsEnabled ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
                </button>
              </div>

              {/* History */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                {agentHistory.length === 0 && (
                  <div className="text-center py-8">
                    <div className="w-12 h-12 mx-auto mb-3 rounded-full border border-[rgba(160,21,21,0.22)] bg-[rgba(255,30,30,0.06)] flex items-center justify-center">
                      <Cpu className="w-6 h-6 text-[rgba(255,68,68,0.4)]" />
                    </div>
                    <p className="font-orbitron text-[10px] text-[rgba(255,68,68,0.4)] tracking-widest mb-1">AGENT MODE</p>
                    <p className="text-[11px] text-[rgba(255,68,68,0.35)]">Tell CARVIS what to do on this page.</p>
                    <div className="mt-3 space-y-1">
                      {["Open my assignments", "Scroll down", "Go to grades"].map((hint) => (
                        <button key={hint} onClick={() => void sendAgentCommand(hint)}
                          className="block w-full text-left px-2.5 py-1.5 rounded border border-[rgba(160,21,21,0.18)] text-[10px] text-[rgba(255,68,68,0.5)] hover:text-[#ff6b3d] hover:border-[rgba(255,68,68,0.35)] transition font-mono">
                          "{hint}"
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {agentHistory.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    {msg.role === "jarvis" ? (
                      <div className="max-w-[85%] space-y-1.5">
                        <div className={`px-3 py-2 rounded-xl rounded-tl-sm text-[12px] leading-relaxed ${msg.blocked ? "border border-amber-400/30 bg-amber-950/20 text-amber-200" : "border border-[rgba(160,21,21,0.22)] bg-[rgba(255,30,30,0.05)] text-[#f5f5f5]"}`}>
                          {msg.text}
                        </div>
                        {msg.action && !msg.blocked && (
                          <div className="flex items-center gap-1.5 px-1">
                            <span className="text-[rgba(255,68,68,0.5)]">{actionIconMap[msg.action.type]}</span>
                            <span className="text-[9px] text-[rgba(255,68,68,0.5)] font-mono">
                              {msg.action.type === "scroll" ? `scroll ${msg.action.direction}` : msg.action.type === "navigate" ? `→ ${msg.action.url}` : msg.action.type === "fill" ? `type: "${msg.action.value}"` : "click element"}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="max-w-[85%] px-3 py-2 rounded-xl rounded-tr-sm border border-blue-400/20 bg-blue-900/20 text-[12px] text-blue-100">
                        {msg.text}
                      </div>
                    )}
                  </div>
                ))}
                {agentLoading && (
                  <div className="flex justify-start">
                    <div className="px-3 py-2 rounded-xl rounded-tl-sm border border-[rgba(160,21,21,0.22)] bg-[rgba(255,30,30,0.05)]">
                      <div className="flex gap-1">
                        {[0,1,2].map(i => <span key={i} className="w-1.5 h-1.5 rounded-full bg-[#FF4444]/60 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
                      </div>
                    </div>
                  </div>
                )}
                <div ref={historyEndRef} />
              </div>

              {/* Input */}
              <div className="p-3 border-t border-[rgba(160,21,21,0.14)]">
                <div className="flex gap-2 items-end">
                  <div className="flex-1 relative">
                    <input
                      value={agentInput}
                      onChange={(e) => setAgentInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendAgentCommand(agentInput); } }}
                      placeholder="Tell CARVIS what to do…"
                      className="w-full px-3 py-2 rounded-lg border border-[rgba(160,21,21,0.22)] bg-black text-[12px] text-[#f5f5f5] placeholder:text-[rgba(255,68,68,0.35)] focus:outline-none focus:border-[rgba(255,68,68,0.45)] transition font-mono"
                      disabled={agentLoading}
                    />
                  </div>
                  <button onClick={() => void sendAgentCommand(agentInput)} disabled={agentLoading || !agentInput.trim()}
                    className="w-8 h-8 rounded-lg border border-[rgba(255,68,68,0.3)] bg-[rgba(255,30,30,0.1)] flex items-center justify-center text-[rgba(255,68,68,0.65)] hover:bg-[rgba(255,30,30,0.14)] hover:border-[rgba(255,68,68,0.5)] disabled:opacity-40 transition shrink-0">
                    {agentLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={toggleVoice}
                    className={`w-8 h-8 rounded-lg border flex items-center justify-center transition shrink-0 ${isListening ? "border-red-400/60 bg-red-500/10 text-red-400" : "border-[rgba(160,21,21,0.22)] bg-[rgba(255,30,30,0.06)] text-[rgba(255,68,68,0.55)] hover:text-[#FF4444] hover:border-[rgba(255,68,68,0.45)]"}`}>
                    {isListening ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mic className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {/* Quick actions */}
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {[{ icon: <ArrowDown className="w-3 h-3" />, label: "Scroll down", cmd: "scroll down" }, { icon: <ArrowUp className="w-3 h-3" />, label: "Scroll up", cmd: "scroll up" }, { icon: <Navigation className="w-3 h-3" />, label: "Assignments", cmd: "open assignments" }, { icon: <Zap className="w-3 h-3" />, label: "Grades", cmd: "open grades" }].map((btn) => (
                    <button key={btn.cmd} onClick={() => void sendAgentCommand(btn.cmd)} disabled={agentLoading}
                      className="flex items-center gap-1 px-2 py-1 rounded border border-[rgba(160,21,21,0.18)] text-[9px] text-[rgba(255,68,68,0.5)] hover:text-[#ff6b3d] hover:border-[rgba(255,68,68,0.35)] transition disabled:opacity-30">
                      {btn.icon}{btn.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* DATA TAB */}
          {tab === "data" && (
            <div className="p-3 space-y-3">
              <div>
                <p className="text-[9px] font-bold tracking-[0.15em] text-[rgba(255,68,68,0.4)] mb-2 uppercase">Grade Readout</p>
                {grades.length > 0 ? (
                  <div className="space-y-2.5">
                    {grades.map((g) => (
                      <div key={g.name} className="rounded-lg border border-[rgba(160,21,21,0.18)] bg-[rgba(255,30,30,0.04)] p-2.5">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[11px] font-semibold text-[#f5f5f5] truncate max-w-[75%]">{g.name}</span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {g.letterGrade && <span className={`font-orbitron text-[11px] font-bold ${g.percent >= 85 ? "text-green-400" : g.percent >= 70 ? "text-amber-400" : "text-red-400"}`}>{g.letterGrade}</span>}
                            <span className={`text-[11px] font-mono ${g.percent >= 85 ? "text-green-400/70" : g.percent >= 70 ? "text-amber-400/70" : "text-red-400/70"}`}>{g.percent.toFixed(1)}%</span>
                          </div>
                        </div>
                        <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${g.percent >= 85 ? "bg-gradient-to-r from-green-500 to-emerald-400" : g.percent >= 70 ? "bg-gradient-to-r from-amber-500 to-yellow-400" : "bg-gradient-to-r from-red-500 to-rose-400"}`}
                            style={{ width: `${Math.min(g.percent, 100)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-[11px] text-[rgba(255,68,68,0.4)]">No grades loaded — sync Canvas first</p>
                  </div>
                )}
              </div>

              <div>
                <p className="text-[9px] font-bold tracking-[0.15em] text-[rgba(255,68,68,0.4)] mb-2 uppercase">Courses ({courses.length})</p>
                {courses.length > 0 ? (
                  <div className="space-y-1.5">
                    {courses.map((c) => (
                      <div key={c.id} className="flex items-center justify-between px-2.5 py-2 rounded-lg border border-[rgba(160,21,21,0.14)] bg-[rgba(255,30,30,0.04)]">
                        <span className="text-[11px] text-[#f5f5f5] font-semibold truncate">{c.name}</span>
                        <span className="text-[9px] text-[rgba(255,68,68,0.4)] font-mono shrink-0 ml-2">{c.assignments.length} tasks</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-[rgba(255,68,68,0.4)] text-center py-3">Connect Canvas to load courses</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-3 py-2 border-t border-[rgba(160,21,21,0.14)] flex items-center justify-between">
          <span className="text-[9px] font-mono text-[rgba(255,68,68,0.35)]">{pageContext ? new URL(pageContext.url).hostname : "canvas"}</span>
          <span className="flex items-center gap-1 text-[9px] text-[rgba(255,68,68,0.4)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#FF4444] shadow-[0_0_4px_rgba(255,68,68,0.55)] animate-pulse" />
            LIVE
          </span>
        </div>
      </div>
    </div>
  );
}
