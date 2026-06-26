// useChat — React Query bindings for the Phase 1 multi-turn chat API.
//
// Provides session list, message history, and mutation hooks. Everything goes
// through /api/chat/* and uses cookie credentials so the existing jarvis_session
// auth just works.
//
// Cache keys are colocated near the hooks so misspellings across files can be
// grepped cleanly. Optimistic updates keep the chat UI snappy: the user
// message shows immediately, the assistant message placeholder replaces it
// once the request resolves.

import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";

export interface ChatSession {
  id: string;
  userId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: number;
  userId: string;
  sessionId: string | null;
  role: "user" | "assistant" | string;
  message: string;
  intent: string | null;
  createdAt: string;
}

export interface SendMessageResponse {
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  intent: string;
  confidence: number;
  sessionTitle: string | null;
}

// Cache key conventions so we don't double-define strings across files.
export const chatKeys = {
  all: ["chat"] as const,
  sessions: () => [...chatKeys.all, "sessions"] as const,
  session: (id: string | null | undefined) => [...chatKeys.all, "session", id ?? "_"] as const,
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

/** List the user's chat sessions (max 5), newest-first. */
export function useChatSessions(options?: Partial<UseQueryOptions<ChatSession[]>>) {
  return useQuery<ChatSession[]>({
    queryKey: chatKeys.sessions(),
    queryFn: async () => {
      const data = await fetchJson<{ sessions: ChatSession[] }>("/api/chat/sessions");
      return data.sessions ?? [];
    },
    staleTime: 30_000,
    ...options,
  });
}

/** Fetch one session's metadata + full message history. */
export function useChatSession(
  sessionId: string | null | undefined,
  options?: Partial<UseQueryOptions<{ session: ChatSession; messages: ChatMessage[] }>>,
) {
  return useQuery<{ session: ChatSession; messages: ChatMessage[] }>({
    enabled: Boolean(sessionId),
    queryKey: chatKeys.session(sessionId),
    queryFn: () => fetchJson(`/api/chat/sessions/${sessionId}`),
    staleTime: 5_000,
    ...options,
  });
}

/** Create a new session. Optionally accepts a firstMessage to send in one round-trip. */
export function useCreateSession() {
  const qc = useQueryClient();
  return useMutation<{ session: ChatSession }, Error, { firstMessage?: string } | void>({
    mutationFn: (input) =>
      fetchJson<{ session: ChatSession }>("/api/chat/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input ?? {}),
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: chatKeys.sessions() });
      qc.invalidateQueries({ queryKey: chatKeys.session(data.session.id) });
    },
  });
}

/** Delete a session. Cascade-removes its messages. */
export function useDeleteSession() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (sessionId) =>
      fetchJson<void>(`/api/chat/sessions/${sessionId}`, { method: "DELETE" }),
    onSuccess: (_void, sessionId) => {
      qc.invalidateQueries({ queryKey: chatKeys.sessions() });
      qc.removeQueries({ queryKey: chatKeys.session(sessionId) });
    },
  });
}

/** Send a message in a session and append the assistant reply. */
export function useSendMessage(sessionId: string | null | undefined) {
  const qc = useQueryClient();
  // 4th generic defines the type of the value returned by `onMutate` so
  // the `onError`/`onSuccess` callbacks receive a properly-typed `ctx`
  // (not `unknown`). Without this, the `ctx && "previous" in ctx` guard
  // below trips TS2638 because `unknown` may be a primitive and `in`
  // requires an object.
  type SendMessageContext = {
    previous: { session: ChatSession; messages: ChatMessage[] } | undefined;
  } | undefined;
  return useMutation<SendMessageResponse, Error, string, SendMessageContext>({
    mutationFn: async (message) => {
      if (!sessionId) throw new Error("No active session");
      return fetchJson<SendMessageResponse>(`/api/chat/sessions/${sessionId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
    },
    // Optimistic: render the user's text immediately so the typing indicator
    // feels responsive. The assistant row is added by onSuccess so we don't
    // guess an AI reply that may not arrive.
    onMutate: async (message) => {
      if (!sessionId) return undefined;
      await qc.cancelQueries({ queryKey: chatKeys.session(sessionId) });
      const previous = qc.getQueryData<{ session: ChatSession; messages: ChatMessage[] }>(
        chatKeys.session(sessionId),
      );
      const optimisticUser: ChatMessage = {
        id: -1,
        userId: "",
        sessionId,
        role: "user",
        message,
        intent: null,
        createdAt: new Date().toISOString(),
      };
      qc.setQueryData<{ session: ChatSession; messages: ChatMessage[] }>(
        chatKeys.session(sessionId),
        (old) =>
          old
            ? { ...old, messages: [...old.messages, optimisticUser] }
            : { session: null as unknown as ChatSession, messages: [optimisticUser] },
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (sessionId && ctx && "previous" in ctx) {
        qc.setQueryData(chatKeys.session(sessionId), ctx.previous);
      }
    },
    onSuccess: (data) => {
      if (sessionId) {
        qc.setQueryData<{ session: ChatSession; messages: ChatMessage[] }>(
          chatKeys.session(sessionId),
          (old) => {
            // Strip the optimistic user row (id = -1) and append real rows.
            const baseMessages = (old?.messages ?? []).filter((m) => m.id !== -1);
            return {
              session: old?.session ?? data.userMessage ? {
                id: data.userMessage.sessionId ?? sessionId,
                userId: data.userMessage.userId,
                title: data.sessionTitle,
                createdAt: old?.session?.createdAt ?? data.userMessage.createdAt,
                updatedAt: new Date().toISOString(),
              } : null as unknown as ChatSession,
              messages: [...baseMessages, data.userMessage, data.assistantMessage],
            };
          },
        );
      }
      qc.invalidateQueries({ queryKey: chatKeys.sessions() });
    },
  });
}

/** Convenience facade that ties session + send hooks together. */
export function useChat(initialSessionId?: string | null) {
  const sessions = useChatSessions();
  const activeSessionId =
    initialSessionId ??
    (sessions.data && sessions.data.length > 0 ? sessions.data[0].id : null);
  const current = useChatSession(activeSessionId);
  const create = useCreateSession();
  const remove = useDeleteSession();
  const send = useSendMessage(activeSessionId);

  return {
    sessions: sessions.data ?? [],
    activeSessionId,
    currentSession: current.data,
    isLoadingSessions: sessions.isLoading,
    isLoadingCurrent: current.isLoading,
    createSession: create.mutateAsync,
    isCreating: create.isPending,
    deleteSession: remove.mutateAsync,
    sendMessage: send.mutateAsync,
    isSending: send.isPending,
    refetchSessions: sessions.refetch,
  };
}
