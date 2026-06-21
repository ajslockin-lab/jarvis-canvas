// FirstRunNudge: three example-question chips that appear once the first sync
// completes. Each chip is a one-tap interaction: clicking it opens the voice
// interface with the question pre-filled as text, so the magic-moment path
// from "I have no idea what to ask" to "I have an answer" is a single click.
//
// Why chips (not a free text input on the dashboard):
//   - The 90-second window is when the user is forming their first impression.
//     An empty input invites "what do I type?" — chips collapse that question
//     to zero. The user sees a suggested question, taps it, gets a real answer.
//   - The chips also double as activation telemetry: clicking any chip fires
//     the first_question_asked event exactly once.
//
// Why "What's due this week?" is the first chip:
//   - It maps to the value loop (assignments → answer) and is what a student
//     would want to know within 5 minutes of signing in for the term.
//   - It's the most common, least-fragile query — it works even with zero
//     grades, even before the calendar populates.

import { X, ArrowRight, Sparkles } from "lucide-react";
import { firstRunActivationStorageKey } from "@/lib/useFirstRunState";

export interface FirstRunNudgeProps {
  userId: string;
  /** Used to personalize the second chip ("What grade do I have in <X>?").
   *  Optional — falls back to a generic "your first course" copy. */
  firstCourseName?: string | null;
  /** Fired when the user clicks any chip. The dashboard handles opening the
   *  voice modal and pre-filling the input. */
  onAsk: (question: string) => void;
  /** Fired when the user dismisses the nudge (X button). Persists in
   *  localStorage so the nudge doesn't reappear. */
  onDismiss: () => void;
}

function buildQuestions(firstCourseName: string | null | undefined): string[] {
  return [
    "What's due this week?",
    firstCourseName
      ? `What grade do I have in ${firstCourseName}?`
      : "What grade do I have in my first course?",
    "Show me overdue work",
  ];
}

export default function FirstRunNudge({
  userId,
  firstCourseName,
  onAsk,
  onDismiss,
}: FirstRunNudgeProps) {
  const questions = buildQuestions(firstCourseName);

  // Fire-and-forget activation event. The server dedupes per (userId, eventType)
  // so we can call this naively on every chip click — only the first wins.
  // Wrapping in a small helper keeps the JSX readable.
  const fireActivation = () => {
    // localStorage guard against double-fire on rapid re-renders. The server
    // is the source of truth, but this avoids a needless request when the
    // user spam-clicks.
    const flagKey = firstRunActivationStorageKey(userId, "nudge");
    const alreadyFired = window.localStorage.getItem(`${flagKey}__first_question_asked`) === "1";
    if (alreadyFired) return;
    window.localStorage.setItem(`${flagKey}__first_question_asked`, "1");
    void fetch("/api/canvas/activation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ eventType: "first_question_asked" }),
    }).catch(() => {
      // Non-fatal — activation is analytics, not a feature. If the request
      // fails, revert the local flag so a future reload can retry.
      window.localStorage.removeItem(`${flagKey}__first_question_asked`);
    });
  };

  return (
    <div
      className="hud-panel p-4 md:p-5"
      role="region"
      aria-label="Try asking Carvis a question"
    >
      <span className="corner-br" />
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#00FF88]" />
          <h3 className="font-orbitron text-[11px] font-bold tracking-[0.2em] text-[#00FF88] uppercase">
            Try asking Carvis
          </h3>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss example questions"
          className="text-[rgba(245,245,245,0.4)] hover:text-[#f5f5f5] transition p-1 -m-1"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="font-rajdhani text-[12px] text-[rgba(245,245,245,0.55)] mb-4">
        Tap a question to get an instant answer. No typing required.
      </p>
      <ul className="space-y-2">
        {questions.map((q) => (
          <li key={q}>
            <button
              type="button"
              onClick={() => {
                fireActivation();
                onAsk(q);
              }}
              className="w-full text-left flex items-center justify-between gap-3 px-3 py-2.5 border border-[rgba(160,21,21,0.2)] bg-[#0a0000]/40 hover:border-[#FF4444]/60 hover:bg-[#FF4444]/5 transition rounded group"
            >
              <span className="font-rajdhani text-[13px] text-[#f5f5f5]">
                {q}
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-[#FF4444] opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition shrink-0" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
