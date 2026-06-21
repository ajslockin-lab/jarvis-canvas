// FirstRunBanner: phase-aware status line that lives at the top of the dashboard
// during the first sync after sign-in. Renders nothing once sync is complete.
//
// Why a banner (not a modal):
//   - Modals block interaction. The user has nothing to do except wait for
//     Canvas to respond — the dashboard itself is the interesting screen.
//     A modal would force them to dismiss it before they can read anything.
//   - Modals also flash for ~50-100ms during the phase transition window,
//     which feels jarring at the 2s "courses loaded" moment. A banner just
//     updates its copy.
//
// Phase semantics (kept in sync with routes/canvas.ts):
//   idle        — never synced. Should only appear if polling started before
//                 POST /canvas/sync landed.
//   courses     — currently fetching courses. Course count is already known
//                 once the first endpoint returns, so we can name the school.
//   assignments — courses done, assignments in flight.
//   grades      — assignments done, grades in flight. Usually instant.
//   done        — sync complete. Banner unmounts (parent decides via phase).
//   error       — top-level failure. Show retry CTA. Inline (not modal) per
//                 the partial-success UX plan.

import { RefreshCw, AlertCircle, Loader2 } from "lucide-react";

export type SyncPhase =
  | "idle"
  | "courses"
  | "assignments"
  | "grades"
  | "done"
  | "error";

export interface FirstRunBannerProps {
  phase: SyncPhase;
  /** Display name of the Canvas school, e.g. "Stanford University". Used in
   *  the "courses" phase copy. Optional — omitted while still resolving. */
  schoolName?: string | null;
  /** Number of courses returned so far. Defaults to 0 — the banner only
   *  mentions this count during/after the courses phase. */
  courseCount?: number;
  /** Server-reported partial error (phase=done + error="Some assignments
   *  couldn't be loaded"). Shown as a small inline note, not as the banner
   *  primary copy. */
  partialError?: string | null;
  /** Fired when the user clicks "Retry Sync" on the error state. */
  onRetry?: () => void;
}

function phaseCopy(props: FirstRunBannerProps): {
  icon: "loading" | "error";
  primary: string;
  secondary?: string;
} | null {
  switch (props.phase) {
    case "idle":
      return {
        icon: "loading",
        primary: "Preparing your Canvas workspace…",
        secondary: "This usually takes 5–20 seconds.",
      };
    case "courses":
      return {
        icon: "loading",
        primary: `Reading ${props.courseCount ?? 0} course${
          props.courseCount === 1 ? "" : "s"
        } from ${props.schoolName ?? "Canvas"}…`,
        secondary: "Authenticating and pulling your enrollment list.",
      };
    case "assignments":
      return {
        icon: "loading",
        primary: `Loading assignments — this usually takes ~10s`,
        secondary: props.courseCount
          ? `Pulling ${props.courseCount} course${props.courseCount === 1 ? "" : "s"} in parallel.`
          : undefined,
      };
    case "grades":
      return {
        icon: "loading",
        primary: "Almost there — pulling grades",
        secondary: "Last step before Carvis can answer questions about your coursework.",
      };
    case "done":
      // Banner unmounts at the parent; never reached here but explicit for type safety.
      return null;
    case "error":
      return {
        icon: "error",
        primary: "Couldn't reach Canvas",
        secondary:
          "Your sign-in is saved. Try again when you have a moment — nothing was lost.",
      };
  }
}

export default function FirstRunBanner(props: FirstRunBannerProps) {
  const copy = phaseCopy(props);
  if (!copy) return null;

  const isError = copy.icon === "error";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`hud-panel mb-6 p-4 flex items-start gap-3 transition-opacity ${
        isError ? "border-[#FF6B3D]/40" : ""
      }`}
    >
      <span className="corner-br" />
      <div className="mt-0.5 shrink-0">
        {isError ? (
          <AlertCircle className="w-5 h-5 text-[#FF6B3D]" />
        ) : (
          <Loader2 className="w-5 h-5 text-[#FF4444] hud-sync-active" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-orbitron text-sm text-[#f5f5f5] tracking-wide">
          {copy.primary}
        </p>
        {copy.secondary && (
          <p className="font-rajdhani text-[12px] text-[rgba(245,245,245,0.55)] mt-1">
            {copy.secondary}
          </p>
        )}
        {props.partialError && props.phase === "done" && (
          // Defensive: parent normally unmounts us at phase=done, but if a
          // caller keeps us mounted, surface the partial-error inline note.
          <p className="font-mono-data text-[11px] text-[#FF6B3D] mt-2">
            ⚠ {props.partialError}
          </p>
        )}
      </div>
      {isError && props.onRetry && (
        <button
          type="button"
          onClick={props.onRetry}
          className="hud-btn px-3 py-2 flex items-center gap-2 shrink-0"
        >
          <RefreshCw className="w-3 h-3" />
          <span className="font-orbitron text-[11px] tracking-[0.15em]">
            RETRY SYNC
          </span>
        </button>
      )}
    </div>
  );
}
