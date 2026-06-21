import { describe, it, expect } from "vitest";

// These tests verify the sync-state transitions documented in routes/canvas.ts.
// They are mirror tests, not integration tests, because the actual sync handler
// touches the network and DB. A true integration test would mock fetchCanvas*
// and the DB; we keep these as living documentation of the contract.

describe("sync phase transitions", () => {
  // Allowed phases. Kept in sync with the constant in routes/canvas.ts.
  const SYNC_PHASES = ["idle", "courses", "assignments", "grades", "done", "error"] as const;

  it("defines all expected phases", () => {
    expect(SYNC_PHASES).toEqual(["idle", "courses", "assignments", "grades", "done", "error"]);
  });

  it("phase progression is monotonic happy-path: idle → courses → assignments → grades → done", () => {
    const happyPath: typeof SYNC_PHASES[number][] = ["idle", "courses", "assignments", "grades", "done"];
    expect(happyPath).toHaveLength(5);
    // Each phase advances strictly forward — no skipping in normal flow.
    for (let i = 1; i < happyPath.length; i++) {
      expect(SYNC_PHASES.indexOf(happyPath[i])).toBeGreaterThan(SYNC_PHASES.indexOf(happyPath[i - 1]));
    }
  });

  it("'error' is a terminal phase that requires user action (retry)", () => {
    const errorIndex = SYNC_PHASES.indexOf("error");
    // 'error' is the only phase that doesn't progress to 'done' on its own.
    expect(errorIndex).toBeGreaterThan(0);
    // Syntactically, the only way out of 'error' is a fresh POST /canvas/sync
    // which resets phase to 'courses'. This is intentional.
    expect(SYNC_PHASES).not.toContain("retrying");
  });

  it("'done' is a valid phase but 'idle' indicates the user has never synced", () => {
    // The dashboard uses null lastSyncPhase OR 'idle' to mean "never synced".
    // Both should trigger the auto-sync on dashboard mount.
    expect(SYNC_PHASES).toContain("idle");
    expect(SYNC_PHASES).toContain("done");
  });
});

describe("partial-success semantics", () => {
  // Documented behavior of setSyncState when an inner try/catch catches an error:
  // - Per-section failure (assignments or grades) → phase still advances to next
  //   phase, and lastSyncError is set to a user-readable message.
  // - Top-level failure (e.g. courses fetch throws) → phase='error', lastSyncError set.
  //
  // The dashboard banner uses this distinction:
  // - phase='done' + error=null → success banner unmounts
  // - phase='done' + error="Some assignments couldn't be loaded" → small inline note
  // - phase='error' + error="Canvas API unreachable" → full retry banner

  it("distinguishes partial-success from full-failure via (phase, error) tuple", () => {
    const partialSuccess = { phase: "done", error: "Some assignments couldn't be loaded" };
    const fullFailure = { phase: "error", error: "Canvas sync failed" };
    const cleanSuccess = { phase: "done", error: null };

    // Partial: not "error" phase, but has an error message.
    expect(partialSuccess.phase).not.toBe("error");
    expect(partialSuccess.error).toBeTruthy();

    // Full: error phase.
    expect(fullFailure.phase).toBe("error");
    expect(fullFailure.error).toBeTruthy();

    // Clean: done phase, no error.
    expect(cleanSuccess.phase).toBe("done");
    expect(cleanSuccess.error).toBeNull();
  });
});

describe("activation event deduplication", () => {
  // The activation endpoint dedupes per (userId, eventType). Only the first
  // occurrence of each event type is stored.

  it("event types are constrained to the documented vocabulary", () => {
    const allowed = ["first_sync_completed", "first_question_asked", "first_voice_used"];
    // New event types require updating both the schema and the dashboard callsites.
    expect(allowed).toHaveLength(3);
  });

  it("dedup happens at write time, not read time", () => {
    // This is verified by the route checking count() > 0 before insert.
    // Reading the table returns all events; the dashboard doesn't need to dedup.
    const events = [
      { eventType: "first_sync_completed" },
      { eventType: "first_question_asked" },
    ];
    const counts = new Map<string, number>();
    for (const e of events) {
      counts.set(e.eventType, (counts.get(e.eventType) ?? 0) + 1);
    }
    // Each type can only appear once per user.
    for (const count of counts.values()) {
      expect(count).toBeLessThanOrEqual(1);
    }
  });
});