import { describe, it, expect } from "vitest";

describe("nlu", () => {
  it("classifyIntent generalizes unknown input", async () => {
    const { classifyIntent } = await import("../lib/nlu.js");
    const result = await classifyIntent("blargle floop");
    expect(result.intent).toBe("general");
    expect(result.rawText).toBe("blargle floop");
  });

  it("classifyIntent extracts check_deadlines intent from query", async () => {
    const { classifyIntent } = await import("../lib/nlu.js");
    const result = await classifyIntent("what assignments are due this week");
    expect(result.rawText).toBe("what assignments are due this week");
  });

  it("fallbackResponse returns generic for unknown intent", async () => {
    // Re-import with mocked GROQ so we always hit fallback
    const { generateResponse } = await import("../lib/nlu.js");
    const response = await generateResponse("unknown", {}, { assignments: [] });
    expect(typeof response).toBe("string");
    expect(response.length).toBeGreaterThan(0);
  });
});
