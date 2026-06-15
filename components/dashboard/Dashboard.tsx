"use client";

import { useState, useEffect } from "react";
import { Mic, Settings, BookOpen, Zap, RefreshCw, AlertCircle, LayoutDashboard, Bell, TrendingUp } from "lucide-react";
import VoiceInterface from "@/components/voice/VoiceInterface";
import AssignmentCard from "./AssignmentCard";
import FunctionalCalendar from "./FunctionalCalendar";
import GradesPanel from "./GradesPanel";
import ProactiveFeed from "./ProactiveFeed";

interface Course {
  id: string;
  name: string;
  code: string | null;
  color: string | null;
  lastSynced?: string | Date | null;
  assignments: Assignment[];
}

interface Assignment {
  id: string;
  name: string;
  description: string | null;
  dueDate: string | Date | null;
  points: number | null;
  url: string | null;
  completed: boolean;
  course?: { name: string; color?: string | null };
}

export default function Dashboard() {
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/user/data");
      const data = await res.json();

      const syncedCourses = Array.isArray(data.courses) ? (data.courses as Course[]) : [];
      if (syncedCourses.length > 0) {
        setCourses(syncedCourses.map((c) => ({ ...c, code: c.code, color: c.color })));
        const latestSync = syncedCourses
          .map((c) => c.lastSynced)
          .filter(Boolean)
          .sort((a, b) => new Date(b as string | Date).getTime() - new Date(a as string | Date).getTime())[0];
        if (latestSync) setLastSync(new Date(latestSync).toISOString());
      } else {
        setCourses(mockCourses);
      }
    } catch (err) {
      console.error("Fetch error:", err);
      setError("Couldn\u2019t fetch data. Showing demo data.");
      setCourses(mockCourses);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/canvas/sync", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setLastSync(new Date().toISOString());
        await fetchData();
      } else {
        setError(data.error || "Sync failed");
      }
    } catch {
      setError("Sync error - check Canvas token.");
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchData();
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const now = new Date();
  const allAssignments = courses
    .flatMap((c) => c.assignments.map((a) => ({ ...a, course: { name: c.name } })))
    .filter((a) => a.dueDate && new Date(a.dueDate) >= now && !a.completed)
    .sort((a, b) => {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });

  const upcomingAssignments = allAssignments.slice(0, 6);
  const dueToday = allAssignments.filter((a) => a.dueDate && (new Date(a.dueDate).getTime() - now.getTime()) / (1000 * 60 * 60) < 24).length;
  const dueThisWeek = allAssignments.filter((a) => a.dueDate && (new Date(a.dueDate).getTime() - now.getTime()) / (1000 * 60 * 60) < 168).length;

  const timeStr = currentTime.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const dateStr = currentTime.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).toUpperCase();

  return (
    <div className="hud-bg min-h-screen text-[#e8f4f8]">
      <VoiceInterface isOpen={voiceOpen} onClose={() => setVoiceOpen(false)} />
      <div className="hud-scanline" />

      <div className="relative z-10 max-w-7xl mx-auto p-6">
        {/* ===== HUD TOP STRIP ===== */}
        <header className="hud-panel mb-8 p-4">
          <span className="corner-br" />
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {/* Left: Logo */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 flex items-center justify-center border border-[#00B4FF]/40 bg-[#00B4FF]/10">
                <Zap className="w-4 h-4 text-[#00E5FF]" />
              </div>
              <div>
                <h1 className="font-orbitron text-sm font-bold tracking-[0.15em] text-[#00E5FF]">
                  JARVIS
                </h1>
                <p className="font-rajdhani text-[11px] text-[#5a7a8a] tracking-wide">
                  CANVAS INTELLIGENCE // OPS
                </p>
              </div>
            </div>

            {/* Center: Live Clock */}
            <div className="flex flex-col items-center">
              <span className="font-mono-data text-2xl font-bold tracking-widest text-[#00E5FF]">
                {timeStr}
              </span>
              <span className="font-rajdhani text-[10px] tracking-[0.2em] text-[#5a7a8a] uppercase">
                {dateStr}
              </span>
            </div>

            {/* Right: Stats + Controls */}
            <div className="flex items-center gap-4">
              {/* HUD Readouts */}
              <div className="hidden md:flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 border border-[#FF9500]/30 bg-[#FF9500]/5">
                  <Zap className="w-3 h-3 text-[#FF9500]" />
                  <span className="font-mono-data text-xs text-[#FF9500] font-bold">
                    {dueToday} DUE_TODAY
                  </span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 border border-[#00B4FF]/30 bg-[#00B4FF]/5">
                  <Bell className="w-3 h-3 text-[#00B4FF]" />
                  <span className="font-mono-data text-xs text-[#00B4FF] font-bold">
                    {dueThisWeek} THIS_WEEK
                  </span>
                </div>
              </div>

              {/* Sync Button */}
              <button
                onClick={handleSync}
                disabled={syncing}
                className="hud-btn px-3 py-2 flex items-center gap-2 disabled:opacity-50"
                title="Sync Canvas Data"
              >
                <RefreshCw className={`w-3 h-3 ${syncing ? "hud-sync-active" : ""}`} />
                <span className="hidden sm:inline">SYNC</span>
              </button>

              {/* Settings Gear */}
              <a href="/settings" className="hud-gear p-2 border border-[#00B4FF]/20 text-[#5a7a8a] hover:text-[#00E5FF] hover:border-[#00E5FF]/40 transition-all">
                <Settings className="w-4 h-4" />
              </a>
            </div>
          </div>
        </header>

        {/* Error Alert */}
        {error && (
          <div className="hud-alert hud-alert-urgent mb-6 p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-[#FF9500] shrink-0" />
            <p className="font-rajdhani text-sm text-[#FF9500]">{error}</p>
          </div>
        )}

        {/* ===== ACTIVATE CARVIS BUTTON ===== */}
        <div className="text-center mb-10">
          <button
            onClick={() => setVoiceOpen(true)}
            className="arc-reactor-btn inline-flex items-center gap-3 px-12 py-5 font-orbitron text-sm font-bold tracking-[0.12em] uppercase"
          >
            <Mic className="w-5 h-5" />
            <span>ACTIVATE CARVIS</span>
          </button>
          <p className="mt-4 font-mono-data text-[11px] text-[#7d99aa] tracking-wide">
            CMD: &quot;WHAT IS DUE THIS WEEK?&quot; // &quot;REMIND ME 2 HOURS BEFORE BIO LAB&quot;
          </p>
        </div>

        {/* ===== MAIN GRID ===== */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Deadlines + Calendar */}
          <div className="lg:col-span-2 space-y-6">
            {/* Section Header */}
            <div className="hud-section-header">
              <BookOpen className="w-4 h-4 text-[#00B4FF]" />
              <h2 className="font-orbitron text-xs font-bold tracking-[0.2em] text-[#00B4FF] uppercase">
                UPCOMING TARGETS
              </h2>
              {lastSync && (
                <span className="font-mono-data text-[10px] text-[#5a7a8a] ml-2">
                  SYNCED {new Date(lastSync).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </div>

            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-24 border border-[#00B4FF]/10 bg-[#0A1520]/50 animate-pulse" />
                ))}
              </div>
            ) : upcomingAssignments.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {upcomingAssignments.map((assignment) => (
                  <AssignmentCard
                    key={assignment.id}
                    name={assignment.name}
                    courseName={assignment.course?.name}
                    dueDate={assignment.dueDate}
                    url={assignment.url}
                    points={assignment.points}
                    referenceDate={currentTime}
                  />
                ))}
              </div>
            ) : (
              <div className="hud-panel p-8 text-center">
                <span className="corner-br" />
                <BookOpen className="w-6 h-6 text-[#5a7a8a] mx-auto mb-3" />
                <p className="font-orbitron text-sm text-[#5a7a8a]">NO TARGETS DETECTED</p>
                <p className="font-mono-data text-[11px] text-[#5a7a8a] mt-1">
                  CONNECT CANVAS IN SYSTEM SETTINGS
                </p>
              </div>
            )}

            {/* Weekly Calendar */}
            <div className="mt-8">
              <div className="hud-section-header">
                <LayoutDashboard className="w-4 h-4 text-[#00B4FF]" />
                <h2 className="font-orbitron text-xs font-bold tracking-[0.2em] text-[#00B4FF] uppercase">
                  MISSION TIMELINE
                </h2>
              </div>
              <FunctionalCalendar assignments={allAssignments} referenceDate={currentTime} />
            </div>
          </div>

          {/* Right: Grades + Intel */}
          <div className="space-y-6">
            {/* Grades */}
            <div className="hud-panel p-5">
              <span className="corner-br" />
              <div className="hud-section-header mb-4">
                <TrendingUp className="w-4 h-4 text-[#00FF88]" />
                <h2 className="font-orbitron text-xs font-bold tracking-[0.2em] text-[#00FF88] uppercase">
                  GRADE READOUT // LIVE
                </h2>
              </div>
              <GradesPanel grades={demoGrades} />
            </div>

            {/* Proactive Feed */}
            <div className="hud-panel p-5">
              <span className="corner-br" />
              <div className="hud-section-header mb-4">
                <Zap className="w-4 h-4 text-[#FF9500]" />
                <h2 className="font-orbitron text-xs font-bold tracking-[0.2em] text-[#FF9500] uppercase">
                  CARVIS INTEL
                </h2>
              </div>
              <ProactiveFeed />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const mockCourses: Course[] = [
  {
    id: "1",
    name: "Advanced Algebra",
    code: "MAT202",
    color: null,
    assignments: [
      {
        id: "a1",
        name: "Linear Equations Problem Set",
        description: null,
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        points: 50,
        url: null,
        completed: false,
        course: { name: "Advanced Algebra" },
      },
    ],
  },
  {
    id: "2",
    name: "Physics",
    code: "PHYS101",
    color: null,
    assignments: [
      {
        id: "a2",
        name: "Velocity Lab Report",
        description: null,
        dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        points: 100,
        url: null,
        completed: false,
        course: { name: "Physics" },
      },
    ],
  },
  {
    id: "3",
    name: "World History",
    code: "HIS150",
    color: null,
    assignments: [
      {
        id: "a3",
        name: "WWII Causes Essay",
        description: null,
        dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        points: 200,
        url: null,
        completed: false,
        course: { name: "World History" },
      },
    ],
  },
];

const demoGrades = [
  { name: "Advanced Algebra", percent: 92, trend: "up" as const, change: 3 },
  { name: "Physics", percent: 76, trend: "same" as const, change: 0 },
  { name: "World History", percent: 89, trend: "up" as const, change: 1 },
];
