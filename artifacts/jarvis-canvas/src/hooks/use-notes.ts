// useNotes — React Query bindings for the Phase 4 notes API.
//
// Provides list/create/delete. Optimistic prepend on create so the
// dashboard card updates in one frame even on a slow network.

import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";

export interface Note {
  id: string;
  userId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface NoteListResponse {
  notes: Note[];
  next: string | null;
}

export const notesKeys = {
  all: ["notes"] as const,
  list: (limit?: number) => [...notesKeys.all, "list", limit ?? 50] as const,
};

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { credentials: "include", ...init });
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = (body as { error?: string }).error ?? "";
    } catch {}
    throw new Error(detail || `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

/** List notes (newest-first). */
export function useNotes(
  options?: Partial<UseQueryOptions<NoteListResponse>>,
) {
  return useQuery<NoteListResponse>({
    queryKey: notesKeys.list(),
    queryFn: () => fetchJson<NoteListResponse>("/api/notes"),
    staleTime: 30_000,
    ...options,
  });
}

/** Create a note. Optimistically prepends to the cached list. */
export function useCreateNote() {
  const qc = useQueryClient();
  type Ctx = { previous: NoteListResponse | undefined };
  return useMutation<{ note: Note }, Error, { body: string }, Ctx>({
    mutationFn: (input) =>
      fetchJson<{ note: Note }>("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: notesKeys.list() });
      const previous = qc.getQueryData<NoteListResponse>(notesKeys.list());
      if (previous) {
        const optimistic: Note = {
          id: `optimistic-${Date.now()}`,
          userId: "",
          body: input.body,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        qc.setQueryData<NoteListResponse>(notesKeys.list(), {
          notes: [optimistic, ...previous.notes],
          next: previous.next,
        });
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(notesKeys.list(), ctx.previous);
    },
    onSuccess: (data) => {
      qc.setQueryData<NoteListResponse>(notesKeys.list(), (old) => {
        // Swap the optimistic row out for the server's authoritative one.
        const merged = (old?.notes ?? []).map((n) =>
          n.id.startsWith("optimistic-") && n.body === data.note.body ? data.note : n,
        );
        // Defensive: if the optimistic wasn't there for some reason, prepend.
        if (!merged.some((n) => n.id === data.note.id)) merged.unshift(data.note);
        return { notes: merged, next: old?.next ?? null };
      });
    },
  });
}

/** Delete a note by id; clears the list cache on settle. */
export function useDeleteNote() {
  const qc = useQueryClient();
  type Ctx = { previous: NoteListResponse | undefined; deletedId: string };
  return useMutation<void, Error, string, Ctx>({
    mutationFn: (id) =>
      fetchJson<void>(`/api/notes/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: notesKeys.list() });
      const previous = qc.getQueryData<NoteListResponse>(notesKeys.list());
      if (previous) {
        qc.setQueryData<NoteListResponse>(notesKeys.list(), {
          notes: previous.notes.filter((n) => n.id !== id),
          next: previous.next,
        });
      }
      return { previous, deletedId: id };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(notesKeys.list(), ctx.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: notesKeys.list() });
    },
  });
}
