// useCalendar — React Query bindings for the Phase 2 / Tier 0 calendar API.
//
// Provides the next-14-days list and a manual-sync mutation. The hook is
// read-only on purpose: writes (Tier 1/2 — Google OAuth two-way) come later.

import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";

export interface CalendarEvent {
  id: string;
  userId: string;
  sourceId: string;
  summary: string | null;
  description: string | null;
  location: string | null;
  startAt: string;
  endAt: string | null;
  lastSyncedAt: string;
}

export interface CalendarListResponse {
  events: CalendarEvent[];
  from: string;
  to: string;
}

export interface CalendarSyncResponse {
  synced: number;
  inserted: number;
  updated: number;
  removed: number;
  errors: string[];
}

// Cache key convention — colocated so misspellings across files can be
// grepped cleanly from a single place.
export const calendarKeys = {
  all: ["calendar"] as const,
  events: (from?: string, to?: string) =>
    [...calendarKeys.all, "events", from ?? "_", to ?? "_"] as const,
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
  return (await res.json()) as T;
}

/** List the user's calendar events between [from, to]. Defaults to next 14d. */
export function useCalendarEvents(
  options?: Partial<UseQueryOptions<CalendarListResponse>>,
) {
  return useQuery<CalendarListResponse>({
    queryKey: calendarKeys.events(),
    queryFn: () => fetchJson<CalendarListResponse>("/api/calendar/events"),
    staleTime: 60_000,
    ...options,
  });
}

/** Manual sync. POST returns the diff counts; we invalidate cache on settle. */
export function useSyncCalendar() {
  const qc = useQueryClient();
  return useMutation<CalendarSyncResponse, Error, void>({
    mutationFn: () =>
      fetchJson<CalendarSyncResponse>("/api/calendar/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: calendarKeys.all });
    },
  });
}
