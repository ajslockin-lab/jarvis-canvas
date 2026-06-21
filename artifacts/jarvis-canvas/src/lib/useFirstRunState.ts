// Per-user first-run state, persisted to localStorage.
//
// Why per-user, not global:
//   - A student who signs out and signs in as a sibling (or a different
//     school account on a shared laptop) should see the first-run experience
//     again — otherwise we'd be hiding activation cues from a fresh user.
//   - Keying on userId scopes the flag cleanly.
//
// Why localStorage (not server):
//   - This is presentation state, not data. Storing it server-side would
//     require an extra round-trip on every dashboard mount and would couple
//     UX state to the auth layer. localStorage is the right tool.
//
// Why boolean flags, not a "step counter":
//   - A counter would imply a linear funnel. In practice the user can submit
//     a question before enabling voice, dismiss the nudge without asking,
//     etc. Independent booleans match the real shape of the state machine.

import { useCallback, useEffect, useState } from "react";

const NUDGE_DISMISSED_PREFIX = "carvis_first_run_nudge_dismissed_";
const VOICE_MODE_ENABLED_PREFIX = "carvis_voice_mode_enabled_";

function readBool(key: string, defaultValue: boolean): boolean {
  if (typeof window === "undefined") return defaultValue;
  const raw = window.localStorage.getItem(key);
  if (raw === null) return defaultValue;
  return raw === "1";
}

function writeBool(key: string, value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // Storage may be full or blocked (private mode in some browsers).
    // Failing to persist a UI hint is non-fatal — silently degrade.
  }
}

export interface FirstRunState {
  /** Has this user ever been shown the FirstRunNudge chips? Used to keep the
   *  nudge visible across renders until the user dismisses it OR submits a
   *  question via a chip click. */
  nudgeDismissed: boolean;
  dismissNudge: () => void;

  /** Has this user opted in to microphone mode? Defaults to false so first-time
   *  users see the text input first and only see a mic button after they've
   *  proven they want it. Avoids the 30-50% bounce rate from premature mic
   *  permission prompts (NN/g voice UX research). */
  voiceModeEnabled: boolean;
  enableVoiceMode: () => void;
  disableVoiceMode: () => void;

  /** True until the first sync reaches "done" for this user. The dashboard
   *  shows the FirstRunBanner while this is true. Computed from a prop
   *  rather than localStorage because the source of truth is the server. */
  isFirstRun: boolean;
}

export function useFirstRunState(
  userId: string | null | undefined,
  syncPhase: string | null | undefined,
): FirstRunState {
  const nudgeKey = userId ? `${NUDGE_DISMISSED_PREFIX}${userId}` : null;
  const voiceKey = userId ? `${VOICE_MODE_ENABLED_PREFIX}${userId}` : null;

  // Hydration: read once per mount. If userId is null we default both to
  // false — the hook is only meaningful once we know who the user is.
  const [nudgeDismissed, setNudgeDismissed] = useState<boolean>(() =>
    nudgeKey ? readBool(nudgeKey, false) : false,
  );
  const [voiceModeEnabled, setVoiceModeEnabled] = useState<boolean>(() =>
    voiceKey ? readBool(voiceKey, false) : false,
  );

  // If userId arrives later (async session hydrate), re-read from storage.
  useEffect(() => {
    if (!nudgeKey) return;
    setNudgeDismissed(readBool(nudgeKey, false));
  }, [nudgeKey]);

  useEffect(() => {
    if (!voiceKey) return;
    setVoiceModeEnabled(readBool(voiceKey, false));
  }, [voiceKey]);

  const dismissNudge = useCallback(() => {
    setNudgeDismissed(true);
    if (nudgeKey) writeBool(nudgeKey, true);
  }, [nudgeKey]);

  const enableVoiceMode = useCallback(() => {
    setVoiceModeEnabled(true);
    if (voiceKey) writeBool(voiceKey, true);
  }, [voiceKey]);

  const disableVoiceMode = useCallback(() => {
    setVoiceModeEnabled(false);
    if (voiceKey) writeBool(voiceKey, false);
  }, [voiceKey]);

  // A user is "in first run" until the dashboard sees phase=done at least once.
  // null phase means we haven't polled yet — treat as first run so the banner
  // shows on initial render.
  const isFirstRun = syncPhase !== "done";

  return {
    nudgeDismissed,
    dismissNudge,
    voiceModeEnabled,
    enableVoiceMode,
    disableVoiceMode,
    isFirstRun,
  };
}

// Tiny helper so callers don't have to remember the "1"/"0" encoding.
export function firstRunActivationStorageKey(userId: string, kind: "nudge" | "voice"): string {
  return kind === "nudge"
    ? `${NUDGE_DISMISSED_PREFIX}${userId}`
    : `${VOICE_MODE_ENABLED_PREFIX}${userId}`;
}
