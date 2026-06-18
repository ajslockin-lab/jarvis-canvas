import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockFetch = vi.fn();
const originalFetch = globalThis.fetch;

describe("canvas-fetch", () => {
  beforeEach(() => {
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mockFetch.mockReset();
  });

  it("fetches courses successfully", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ id: 1, name: "Test Course" }]),
    });
    const { fetchCanvasCourses } = await import("../lib/canvas-fetch.js");
    const result = await fetchCanvasCourses("fake-token", "https://school.instructure.com");
    expect(result).toEqual([{ id: 1, name: "Test Course" }]);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://school.instructure.com/api/v1/courses?per_page=100",
      expect.objectContaining({ headers: { Authorization: "Bearer fake-token" } })
    );
  });

  it("throws on failed course fetch", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401 });
    const { fetchCanvasCourses } = await import("../lib/canvas-fetch.js");
    await expect(
      fetchCanvasCourses("bad-token", "https://school.instructure.com")
    ).rejects.toThrow("Canvas API error: 401");
  });

  it("fetches user profile", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 42, name: "Test User", primary_email: "test@example.com" }),
    });
    const { fetchCanvasUser } = await import("../lib/canvas-fetch.js");
    const result = await fetchCanvasUser("token", "https://school.instructure.com");
    expect(result.name).toBe("Test User");
  });

  it("fetches assignments for a course", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ id: 101, name: "Assignment 1" }]),
    });
    const { fetchCanvasAssignments } = await import("../lib/canvas-fetch.js");
    const result = await fetchCanvasAssignments("token", "https://school.instructure.com", "1");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Assignment 1");
  });
});
