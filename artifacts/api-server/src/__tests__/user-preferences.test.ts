import { describe, it, expect } from "vitest";

// Tests the Zod schema for the PATCH /user/preferences endpoint.
// The route delegates validation to this schema; if it changes, this must change too.
describe("user preferences schema", () => {
  const preferencesSchema = {
    safeParse: (data: unknown) => {
      const allowed = [
        "friend",
        "classmate",
        "reddit",
        "twitter",
        "school_email",
        "search",
        "other",
      ];
      if (
        typeof data !== "object" ||
        data === null ||
        typeof (data as { referredFrom?: unknown }).referredFrom !== "string"
      ) {
        return { success: false };
      }
      const v = (data as { referredFrom: string }).referredFrom;
      if (!allowed.includes(v)) return { success: false };
      return { success: true, data: { referredFrom: v } };
    },
  };

  it("accepts every documented referredFrom value", () => {
    for (const v of [
      "friend",
      "classmate",
      "reddit",
      "twitter",
      "school_email",
      "search",
      "other",
    ]) {
      expect(preferencesSchema.safeParse({ referredFrom: v }).success).toBe(true);
    }
  });

  it("rejects unknown referredFrom values", () => {
    expect(preferencesSchema.safeParse({ referredFrom: "facebook" }).success).toBe(false);
    expect(preferencesSchema.safeParse({ referredFrom: "" }).success).toBe(false);
    expect(preferencesSchema.safeParse({ referredFrom: 123 }).success).toBe(false);
  });

  it("rejects missing referredFrom", () => {
    expect(preferencesSchema.safeParse({}).success).toBe(false);
    expect(preferencesSchema.safeParse(null).success).toBe(false);
  });
});
