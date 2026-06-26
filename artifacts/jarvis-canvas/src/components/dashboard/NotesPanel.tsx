// NotesPanel — small dashboard card pinned under CARVIS INTEL.
//
// Captures short, single-shot notes. Reads from /api/notes, write through
// POST, delete through DELETE. Optimistic updates keep the input feeling
// instant; on slow networks the optimistic row gets replaced when the
// server returns authoritative data.

import { useState, type FormEvent } from "react";
import { Plus, Trash2, NotebookPen } from "lucide-react";
import { useNotes, useCreateNote, useDeleteNote } from "@/hooks/use-notes";

const MAX_BODY = 4_000;
const VISIBLE_LIMIT = 5;

export default function NotesPanel() {
  const list = useNotes();
  const create = useCreateNote();
  const remove = useDeleteNote();
  const [draft, setDraft] = useState("");

  const notes = list.data?.notes ?? [];

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    create.mutate({ body: body.slice(0, MAX_BODY) });
    setDraft("");
  }

  return (
    <div className="hud-panel p-5">
      <span className="corner-br" />
      <div className="hud-section-header mb-4">
        <NotebookPen className="w-4 h-4 text-[#5a7a8a]" />
        <h2 className="font-orbitron text-xs font-bold tracking-[0.2em] text-[#5a7a8a] uppercase">NOTES</h2>
        {notes.length > 0 && (
          <span className="font-mono-data text-[10px] text-[rgba(245,245,245,0.35)] ml-2">
            {notes.length} STORED
         </span>
        )}
     </div>

      <form onSubmit={onSubmit} className="flex gap-2 mb-4">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Quick capture..."
          maxLength={MAX_BODY}
          className="flex-1 bg-black/40 border border-[rgba(245,245,245,0.15)] rounded px-3 py-2 text-sm font-rajdhani text-[rgba(245,245,245,0.9)] placeholder:text-[rgba(245,245,245,0.3)] focus:outline-none focus:border-[#5a7a8a]"
        />
        <button
          type="submit"
          disabled={!draft.trim() || create.isPending}
          title="Save note"
          aria-label="Save note"
          className="px-3 py-2 border border-[rgba(90,122,138,0.4)] text-[#5a7a8a] hover:bg-[rgba(90,122,138,0.1)] rounded transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4" />
       </button>
     </form>

      {list.isLoading ? (
        <p className="font-mono-data text-[10px] text-[rgba(245,245,245,0.35)]">LOADING…</p>
      ) : notes.length === 0 ? (
        <p className="font-mono-data text-[10px] text-[rgba(245,245,245,0.35)]">
          No notes yet. Type something above, or say "note: chapter 4 review due" to the voice.
       </p>
      ) : (
        <ul className="space-y-2">
          {notes.slice(0, VISIBLE_LIMIT).map((n) => (
            <li
              key={n.id}
              className="group flex items-start gap-2 bg-black/20 border border-[rgba(245,245,245,0.07)] rounded p-2"
            >
              <p className="flex-1 font-rajdhani text-[13px] text-[rgba(245,245,245,0.85)] break-words">
                {n.body}
             </p>
              <button
                onClick={() => remove.mutate(n.id)}
                disabled={remove.isPending}
                title="Delete note"
                aria-label="Delete note"
                className="opacity-40 hover:opacity-100 text-[rgba(245,245,245,0.5)] hover:text-[#FF4444] transition-all disabled:cursor-wait"
              >
                <Trash2 className="w-3.5 h-3.5" />
             </button>
           </li>
          ))}
          {notes.length > VISIBLE_LIMIT && (
            <li className="font-mono-data text-[10px] text-[rgba(245,245,245,0.35)] text-center pt-1">
              +{notes.length - VISIBLE_LIMIT} more — open chat and ask "show my notes"
           </li>
          )}
       </ul>
      )}
   </div>
  );
}
