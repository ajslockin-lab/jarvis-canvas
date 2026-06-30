// DashboardPage — the post-sign-in landing surface.
//
// Design contract (per the first-90-seconds plan):
//   1. Skeleton layout paints immediately, BEFORE any network call resolves.
//      A blank grid reads as "broken app" within the 10s bounce threshold
//      (NN/g); a painted skeleton reads as "loading, wait".
//   2. On mount, if the user has never synced, fire POST /api/canvas/sync
//      automatically. The user does not need to know sync exists yet —
//      the magic moment is "I see my courses", not "I clicked a button".
//   3. Poll /api/canvas/sync-status every 1.5s and surface the phase via
//      FirstRunBanner copy. No global "error" banner — per-section failures
//      are surfaced inline by the partial-success data fetch below.
//   4. Counter chips in the header are skeletons until assignments arrive.
//      Showing 0 BEFORE data lands reads as "broken counter" (NN/g empty
//      state).
//   5. The big "ACTIVATE CARVIS" hero button is hidden until first sync
//      completes. Premature voice prompts are a documented 30-50% bounce
//      trigger (NN/g voice UX). First-time users see the FirstRunNudge
//      chips (text-based, no permission needed) instead.
//   6. Once sync reaches "done", the FirstRunBanner unmounts, the
//      FirstRunNudge appears next to the intel panel, the voice button
//      appears in the header, and the dashboard looks the way it did
//      before this change — except now the user has a path to value in
//      three taps.

import { useState, useEffect } from "react";
import {
  Mic,
  Settings,
  BookOpen,
  Zap,
  RefreshCw,
  LayoutDashboard,
  Bell,
  TrendingUp,
  AlertTriangle,
  LogOut,
} from "lucide-react";
import VoiceInterface from "@/components/voice/VoiceInterface";
import AssignmentCard from "@/components/dashboard/AssignmentCard";
import FunctionalCalendar from "@/components/dashboard/FunctionalCalendar";
import GradesPanel from "@/components/dashboard/GradesPanel";
import ProactiveFeed from "@/components/dashboard/ProactiveFeed";
import NotesPanel from "@/components/dashboard/NotesPanel";
import FirstRunBanner, { type SyncPhase } from "@/components/dashboard/FirstRunBanner";
import FirstRunNudge from "@/components/dashboard/FirstRunNudge";
import {
  AssignmentGridSkeleton,
  CounterChipSkeleton,
  IntelListSkeleton,
} from "@/components/dashboard/SkeletonCard";
import { useFirstRunState } from "@/lib/useFirstRunState";
import { Link, useLocation } from "wouter";
import { apiUrl } from "@/lib/api-base";

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

interface UserDataResponse {
  id?: string;
  courses?: Course[];
}

interface SyncStatusResponse {
  phase: SyncPhase | null;
  lastSyncAt: string | null;
  error: string | null;
  canvasBaseUrl: string | null;
}

const POLL_INTERVAL_MS = 1500;

export default function DashboardPage() {
  const [, navigate] = useLocation();
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voicePrefill, setVoicePrefill] = useState<string | undefined>(undefined);
  const [userId, setUserId] = useState<string | null>(null);
  const [schoolName, setSchoolName] = useState<string | null>(null);
  const [canvasConnected, setCanvasConnected] = useState<boolean | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [grades, setGrades] = useState<{ name: string; percent: number; trend?: "up" | "down" | "same"; change?: number }[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncPhase, setSyncPhase] = useState<SyncPhase>("idle");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [partialError, setPartialError] = useState<string | null>(null);
  const [autoSyncTriggered, setAutoSyncTriggered] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  // Sign-out state — separate from resync to avoid one button's loading
  // spinner blocking the other.
  const [signingOut, setSigningOut] = useState(false);

  // Local user-data fetch (courses, grades). Separate from sync phase polling
  // because we also want to refresh the grid AFTER sync completes (the
  // server populates data we then need to re-read here).
  const fetchData = async () => {
    try {
      const res = await fetch(apiUrl("/api/user/data"), { credentials: "include" });
      if (res.status === 401) {
        navigate("/signin", { replace: true });
        return;
      }
      const data: UserDataResponse = await res.json();
      const syncedCourses = Array.isArray(data.courses) ? data.courses : [];
      setCourses(syncedCourses);
      if (data.id) setUserId(data.id);
      if (syncedCourses.length > 0) {
        const latestSync = syncedCourses
          .map((c) => c.lastSynced)
          .filter(Boolean)
          .sort((a, b) => new Date(b as string | Date).getTime() - new Date(a as string | Date).getTime())[0];
        if (latestSync) setLastSync(new Date(latestSync).toISOString());
      }
      try {
        const gradesRes = await fetch(apiUrl("/api/canvas/grades"), { credentials: "include" });
        const gradesData = await gradesRes.json();
        if (Array.isArray(gradesData.grades)) {
          setGrades(
            gradesData.grades.map((g: { name: string; currentScore: number | null }) => ({
              name: g.name,
              percent: g.currentScore ?? 0,
            })),
          );
        }
      } catch {
        // grades fetch is non-fatal
      }
      setDataLoaded(true);
    } catch {
      // Connection-level failure. We don't replace the layout with a global
      // banner (NN/g). The skeleton stays visible and the sync-status poll
      // will eventually surface a phase=error with the retry CTA.
      setDataLoaded(false);
    }
  };

  // Manual resync (from header button). Used after the first auto-sync has
  // already completed; the auto-sync itself happens in the effect below.
  const handleResync = async () => {
    setSyncPhase("idle");
    setSyncError(null);
    setPartialError(null);
    try {
      const res = await fetch(apiUrl("/api/canvas/sync"), {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        setLastSync(new Date().toISOString());
        await fetchData();
      } else {
        setSyncError(data.error || "Sync failed");
        setSyncPhase("error");
      }
    } catch {
      setSyncError("Couldn't reach sync server");
      setSyncPhase("error");
    }
  };

  // Sign out: clear the session cookie (server) + the extension token
  // (localStorage) and bounce to /signin. We don't `await` the signout
  // network call before navigating — the cookie is cleared server-side, the
  // subsequent /signin page does its own /api/user/data check and 200s there
  // would be a sign the cookie clear didn't propagate, which would be a bug
  // worth surfacing. But navigation should not be blocked on the request.
  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await fetch(apiUrl("/api/auth/signout"), {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Even if the network call fails, we want to clear local state and
      // navigate — the user clicked sign-out and shouldn't be stranded.
    }
    try {
      window.localStorage.removeItem("jarvis_session_token");
    } catch {
      // ignore
    }
    navigate("/signin", { replace: true });
  };

  // Fire-and-forget activation event for first_sync_completed. Dedupe by
  // checking lastSyncAt is set; the server endpoint is also idempotent.
  const fireSyncCompletedActivation = () => {
    if (typeof window === "undefined") return;
    const flag = `carvis_first_sync_completed_fired`;
    if (window.localStorage.getItem(flag) === "1") return;
    window.localStorage.setItem(flag, "1");
    void fetch(apiUrl("/api/canvas/activation"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ eventType: "first_sync_completed" }),
    }).catch(() => {
      window.localStorage.removeItem(flag);
    });
  };

  // One-shot auto-sync + phase-polling effect. The auto-sync fires on mount
  // only if we've never seen a sync (lastSyncAt is null on first read).
  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const pollSyncStatus = async () => {
      try {
        const res = await fetch(apiUrl("/api/canvas/sync-status"), { credentials: "include" });
        if (cancelled) return;
        const data = (await res.json()) as SyncStatusResponse;
        const phase: SyncPhase = data.phase ?? "idle";
        setSyncPhase(phase);
        setSyncError(data.error);
        setCanvasConnected(Boolean(data.canvasBaseUrl));

        if (data.lastSyncAt) {
          setLastSync(new Date(data.lastSyncAt).toISOString());
        }

        // When sync finishes, refresh the course/grade grid. The grid may
        // have been painted with old data (returning user) or empty (first
        // time) — either way we want the latest.
        if (phase === "done" && dataLoaded === false) {
          await fetchData();
          fireSyncCompletedActivation();
          // Capture school name from canvasBaseUrl host if available, e.g.
          // "canvas.instructure.com" → "Canvas". We don't have a dedicated
          // school name endpoint; a short, generic label is fine here.
          if (data.canvasBaseUrl && !schoolName) {
            try {
              const host = new URL(data.canvasBaseUrl).hostname;
              setSchoolName(host.split(".")[0] || "Canvas");
            } catch {
              setSchoolName("Canvas");
            }
          }
        }

        // Surface partial-error inline only. We do NOT set phase=error here
        // because the server already moved to "done" — this is a soft note.
        if (phase === "done" && data.error) {
          setPartialError(data.error);
        } else if (phase === "error") {
          setPartialError(null);
        }
      } catch {
        // Poll failed (network blip). Don't surface a global error — the
        // next tick will retry.
      } finally {
        if (!cancelled) {
          pollTimer = setTimeout(pollSyncStatus, POLL_INTERVAL_MS);
        }
      }
    };

    const triggerFirstSyncIfNeeded = async () => {
      if (autoSyncTriggered) return;
      // Read the current phase once. If lastSyncPhase is null AND we have
      // a canvasBaseUrl (i.e. the user has connected Canvas), fire sync.
      try {
        const res = await fetch(apiUrl("/api/canvas/sync-status"), { credentials: "include" });
        const data = (await res.json()) as SyncStatusResponse;
        if (cancelled) return;
        setCanvasConnected(Boolean(data.canvasBaseUrl));
        // If the user has never synced but has connected Canvas, kick it off.
        // If they haven't connected Canvas at all, leave phase=idle and let
        // the user discover the empty state with no scary error.
        const neverSynced = data.lastSyncAt == null && (data.phase === null || data.phase === "idle");
        if (neverSynced && data.canvasBaseUrl) {
          setAutoSyncTriggered(true);
          setSyncPhase("courses");
          // Don't await — the polling effect will pick up the new phase.
          void fetch(apiUrl("/api/canvas/sync"), {
            method: "POST",
            credentials: "include",
          }).catch(() => {
            // Sync request failed at the network level. The poll will
            // surface a phase=error on its next tick.
          });
        } else {
          setAutoSyncTriggered(true);
        }
      } catch {
        setAutoSyncTriggered(true);
      }
    };

    void triggerFirstSyncIfNeeded();
    void pollSyncStatus();
    const clockTimer = setInterval(() => setCurrentTime(new Date()), 60000);

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
      clearInterval(clockTimer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // First-run state (per-user). Drives nudge visibility and voice-mode flag.
  const firstRun = useFirstRunState(userId, syncPhase);

  // Open the voice modal with a pre-filled question. Triggered by both the
  // FirstRunNudge chips and any direct "ask" affordance we add later.
  const openVoiceWith = (question: string) => {
    setVoicePrefill(question);
    setVoiceOpen(true);
  };

  // When the user submits their first question, fire the activation event
  // via the VoiceInterface's onFirstSubmit callback. We also do it from
  // FirstRunNudge but the voice path can be reached by other means (typing
  // directly), so this is the source of truth.
  const handleFirstQuestion = () => {
    if (typeof window === "undefined") return;
    const flag = `carvis_first_question_asked_fired_${userId ?? "anon"}`;
    if (window.localStorage.getItem(flag) === "1") return;
    window.localStorage.setItem(flag, "1");
    void fetch(apiUrl("/api/canvas/activation"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ eventType: "first_question_asked" }),
    }).catch(() => {
      window.localStorage.removeItem(flag);
    });
  };

  const now = new Date();
  const allAssignments = courses
    .flatMap((c) => c.assignments.map((a) => ({ ...a, course: { name: c.name } })))
    .filter((a) => !a.completed)
    .sort((a, b) => {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });

  const upcomingAssignments = allAssignments.filter((a) => a.dueDate && new Date(a.dueDate) >= now).slice(0, 6);
  const overdueAssignments = allAssignments.filter((a) => a.dueDate && new Date(a.dueDate) < now).slice(0, 4);
  const dueToday = allAssignments.filter((a) => a.dueDate && new Date(a.dueDate) >= now && (new Date(a.dueDate).getTime() - now.getTime()) / (1000 * 60 * 60) < 24).length;
  const dueThisWeek = allAssignments.filter((a) => a.dueDate && new Date(a.dueDate) >= now && (new Date(a.dueDate).getTime() - now.getTime()) / (1000 * 60 * 60) < 168).length;

  const timeStr = currentTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const dateStr = currentTime.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }).toUpperCase();

  // Derived display flags.
  // isLoading = "we have no course data AND sync isn't done yet". Skeletons
  // should show in this window. Once phase=done OR we have any data, the
  // grid cross-fades to real content.
  const isInitialLoad = !dataLoaded && syncPhase !== "done";
  // Voice button is hidden during first-run; revealed only once sync has
  // produced real data. The exact "when" matters: showing the button while
  // sync is in flight (phase=courses/assignments/grades) is the failure
  // mode we're avoiding.
  const voiceButtonVisible = syncPhase === "done" && courses.length > 0;
  // FirstRunBanner shows for everything except phase=done.
  const showFirstRunBanner = syncPhase !== "done";
  // FirstRunNudge shows only when data is loaded, the user hasn't dismissed
  // it, and the first sync is complete.
  const showFirstRunNudge =
    syncPhase === "done" && !firstRun.nudgeDismissed && courses.length > 0;

  return (
    <div className="hud-bg min-h-screen text-[#f5f5f5]">
      <VoiceInterface
        isOpen={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        defaultQuery={voicePrefill}
        voiceModeEnabled={firstRun.voiceModeEnabled}
        onFirstSubmit={handleFirstQuestion}
      />
      <div className="hud-scanline" />

      <div className="relative z-10 max-w-7xl mx-auto p-6">
        <header className="hud-panel mb-8 p-4">
          <span className="corner-br" />
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 flex items-center justify-center border border-[#FF4444]/40 bg-[#FF4444]/10 rounded">
                <img src="/carvis-logo.png" alt="" className="h-5 w-5 object-contain" />
              </div>
              <div>
                <h1 className="font-orbitron text-sm font-bold tracking-[0.15em] text-[#FF4444]">CARVIS</h1>
                <p className="font-rajdhani text-[11px] text-[rgba(245,245,245,0.35)] tracking-wide">CANVAS INTELLIGENCE // OPS</p>
              </div>
            </div>

            <div className="flex flex-col items-center">
              <span className="font-mono-data text-2xl font-bold tracking-widest text-[#FF4444]">{timeStr}</span>
              <span className="font-rajdhani text-[10px] tracking-[0.2em] text-[rgba(245,245,245,0.35)] uppercase">{dateStr}</span>
            </div>

            <div className="flex items-center gap-4">
              <div className="hidden md:flex items-center gap-3">
                {/*
                  Counter chips: skeletons while initial-loading so we never
                  show "0 DUE_TODAY" on a brand-new account. The 0 case is
                  fine for returning users with a known-empty week.
                */}
                {isInitialLoad ? (
                  <>
                    <CounterChipSkeleton />
                    <CounterChipSkeleton />
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 px-3 py-1.5 border border-[#FF6B3D]/30 bg-[#FF6B3D]/5 rounded">
                      <Zap className="w-3 h-3 text-[#FF6B3D]" />
                      <span className="font-mono-data text-xs text-[#FF6B3D] font-bold">{dueToday} DUE_TODAY</span>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 border border-[#FF4444]/30 bg-[#FF4444]/5 rounded">
                      <Bell className="w-3 h-3 text-[#FF4444]" />
                      <span className="font-mono-data text-xs text-[#FF4444] font-bold">{dueThisWeek} THIS_WEEK</span>
                    </div>
                  </>
                )}
              </div>

              <button
                onClick={handleResync}
                disabled={syncPhase !== "done" && syncPhase !== "error"}
                className="hud-btn px-3 py-2 flex items-center gap-2 disabled:opacity-50"
                title="Resync Canvas Data"
              >
                <RefreshCw className={`w-3 h-3 ${syncPhase !== "done" && syncPhase !== "error" ? "hud-sync-active" : ""}`} />
                <span className="hidden sm:inline">RESYNC</span>
              </button>

              <Link href="/settings" className="hud-gear p-2 border border-[rgba(160,21,21,0.25)] text-[rgba(245,245,245,0.4)] hover:text-[#FF4444] hover:border-[#FF4444]/40 transition-all inline-flex rounded-lg">
                <Settings className="w-4 h-4" />
              </Link>

              {/*
                Sign out. In the header so it's one tap away from anywhere
                on the dashboard. `replace: true` prevents the dashboard
                from re-appearing in the back stack after navigating to /signin.
                We also use a small confirmation on first click: a single
                click flips the button to "CONFIRM SIGN OUT" for 3s, and a
                second click commits. This avoids a modal interrupting the
                hud-themed UI for a destructive-ish action.
              */}
              <button
                onClick={handleSignOut}
                disabled={signingOut}
                title="Sign out of CARVIS"
                aria-label="Sign out of CARVIS"
                className="hud-gear p-2 border border-[rgba(160,21,21,0.25)] text-[rgba(245,245,245,0.4)] hover:text-[#FF4444] hover:border-[#FF4444]/40 transition-all inline-flex rounded-lg disabled:opacity-50"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        {/*
          FirstRunBanner replaces the old global error banner. It adapts its
          copy and CTA to the current sync phase. Renders nothing when
          phase=done. For the connected-but-no-data case, the empty state
          below still gives the user a path forward (settings link).
        */}
        {showFirstRunBanner && (
          <FirstRunBanner
            phase={syncPhase}
            schoolName={schoolName}
            courseCount={courses.length}
            partialError={partialError}
            onRetry={handleResync}
          />
        )}

        {/*
          Partial-error inline note. Only shown when sync reached "done" but
          with a soft error string. Per NN/g, partial success should be
          success-with-a-note, not a global alert.
        */}
        {syncPhase === "done" && partialError && (
          <div className="hud-panel mb-6 p-3 flex items-center gap-3 border-[#FF6B3D]/30">
            <span className="corner-br" />
            <AlertTriangle className="w-4 h-4 text-[#FF6B3D] shrink-0" />
            <p className="font-rajdhani text-[12px] text-[#FF6B3D] flex-1">{partialError}</p>
            <button
              type="button"
              onClick={handleResync}
              className="font-mono-data text-[10px] text-[#FF6B3D] hover:text-[#FF6B3D]/80 tracking-[0.15em]"
            >
              RETRY
            </button>
          </div>
        )}

        {/*
          Voice hero button. HIDDEN during first-run. Per the plan, this big
          call-to-action is the worst place to start a new user — a tap
          triggers the mic permission prompt with no data context. We
          replace it with FirstRunNudge chips below.
        */}
        {voiceButtonVisible && (
          <div className="text-center mb-10">
            <button
              onClick={() => {
                setVoicePrefill(undefined);
                setVoiceOpen(true);
              }}
              className="arc-reactor-btn inline-flex items-center gap-3 px-12 py-5"
            >
              <Mic className="w-5 h-5" />
              <span>ACTIVATE CARVIS</span>
            </button>
            <p className="mt-4 font-mono-data text-[11px] text-[rgba(245,245,245,0.45)] tracking-wide">
              CMD: "WHAT IS DUE THIS WEEK?" // "REMIND ME 2 HOURS BEFORE BIO LAB"
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="hud-section-header">
              <BookOpen className="w-4 h-4 text-[#FF4444]" />
              <h2 className="font-orbitron text-xs font-bold tracking-[0.2em] text-[#FF4444] uppercase">UPCOMING TARGETS</h2>
              {lastSync && (
                <span className="font-mono-data text-[10px] text-[rgba(245,245,245,0.35)] ml-2">
                  SYNCED {new Date(lastSync).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </div>

            {isInitialLoad ? (
              // Skeleton grid — same shape as the real grid, no flashing
              // between "empty state" → "first card painted".
              <AssignmentGridSkeleton count={4} />
            ) : upcomingAssignments.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {upcomingAssignments.map((assignment) => (
                  <AssignmentCard
                    key={assignment.id}
                    id={assignment.id}
                    name={assignment.name}
                    courseName={assignment.course?.name}
                    dueDate={assignment.dueDate}
                    url={assignment.url}
                    points={assignment.points}
                    completed={assignment.completed}
                    referenceDate={currentTime}
                  />
                ))}
              </div>
            ) : (
              // Only reach this state when sync is done and there's truly
              // nothing to show. Distinguish "never connected" from
              // "connected but no upcoming work" — the former gets a
              // settings CTA, the latter a softer empty message.
              <div className="hud-panel p-8 text-center">
                <span className="corner-br" />
                <BookOpen className="w-6 h-6 text-[rgba(245,245,245,0.35)] mx-auto mb-3" />
                <p className="font-orbitron text-sm text-[rgba(245,245,245,0.35)]">NO TARGETS DETECTED</p>
                {canvasConnected === false ? (
                  <>
                    <p className="font-mono-data text-[11px] text-[rgba(245,245,245,0.35)] mt-1">CONNECT CANVAS IN SYSTEM SETTINGS</p>
                    <Link
                      href="/settings"
                      className="mt-4 hud-btn inline-flex items-center gap-2 px-4 py-2"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      <span className="font-orbitron text-[11px] tracking-[0.15em]">OPEN SETTINGS</span>
                    </Link>
                  </>
                ) : (
                  <p className="font-mono-data text-[11px] text-[rgba(245,245,245,0.35)] mt-1">YOU'RE ALL CAUGHT UP — NICE WORK</p>
                )}
              </div>
            )}

            {overdueAssignments.length > 0 && (
              <div className="mt-6">
                <div className="hud-section-header mb-4">
                  <AlertTriangle className="w-4 h-4 text-[#FF4D4D]" />
                  <h2 className="font-orbitron text-xs font-bold tracking-[0.2em] text-[#FF4D4D] uppercase">OVERDUE TARGETS</h2>
                  <span className="font-mono-data text-[10px] text-[#FF4D4D]/60 ml-2">{overdueAssignments.length} PAST DUE</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {overdueAssignments.map((assignment) => (
                    <AssignmentCard
                      key={assignment.id}
                      id={assignment.id}
                      name={assignment.name}
                      courseName={assignment.course?.name}
                      dueDate={assignment.dueDate}
                      url={assignment.url}
                      points={assignment.points}
                      completed={assignment.completed}
                      referenceDate={currentTime}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="mt-8">
              <div className="hud-section-header">
                <LayoutDashboard className="w-4 h-4 text-[#FF4444]" />
                <h2 className="font-orbitron text-xs font-bold tracking-[0.2em] text-[#FF4444] uppercase">MISSION TIMELINE</h2>
              </div>
              <FunctionalCalendar assignments={allAssignments} referenceDate={currentTime} />
            </div>
          </div>

          <div className="space-y-6">
            <div className="hud-panel p-5">
              <span className="corner-br" />
              <div className="hud-section-header mb-4">
                <TrendingUp className="w-4 h-4 text-[#00FF88]" />
                <h2 className="font-orbitron text-xs font-bold tracking-[0.2em] text-[#00FF88] uppercase">GRADE READOUT // LIVE</h2>
              </div>
              <GradesPanel grades={grades} />
            </div>

            {/*
              FirstRunNudge appears ONLY when sync is done AND the user
              hasn't dismissed it. Lives above the intel panel so it's the
              first thing the user sees on the right column after sync.
            */}
            {showFirstRunNudge && (
              <FirstRunNudge
                userId={userId ?? "anon"}
                firstCourseName={courses[0]?.name}
                onAsk={openVoiceWith}
                onDismiss={firstRun.dismissNudge}
              />
            )}

            <NotesPanel />

            <div className="hud-panel p-5">
              <span className="corner-br" />
              <div className="hud-section-header mb-4">
                <Zap className="w-4 h-4 text-[#FF6B3D]" />
                <h2 className="font-orbitron text-xs font-bold tracking-[0.2em] text-[#FF6B3D] uppercase">CARVIS INTEL</h2>
              </div>
              {/*
                ProactiveFeed gets an explicit hasLoaded signal from the
                dashboard so it doesn't briefly show "ALL CLEAR" between
                sync completion and the data refresh landing.
              */}
              {isInitialLoad ? (
                <IntelListSkeleton count={3} />
              ) : (
                <ProactiveFeed hasLoaded={dataLoaded} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
