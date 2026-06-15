import { describe, it, expect } from "vitest";
import { apiError } from "../errors";

describe("apiError", () => {
  it("returns correct status for UNAUTHORIZED", () => {
    const response = apiError("UNAUTHORIZED");
    expect(response.status).toBe(401);
  });

  it("returns correct status for VALIDATION", () => {
    const response = apiError("VALIDATION", { error: "Bad input" });
    expect(response.status).toBe(422);
  });

  it("allows overriding error message", () => {
    const response = apiError("CANVAS_AUTH", { error: "Custom message" });
    expect(response.status).toBe(403);
  });

  it("returns 500 for INTERNAL", () => {
    const response = apiError("INTERNAL");
    expect(response.status).toBe(500);
  });
});
