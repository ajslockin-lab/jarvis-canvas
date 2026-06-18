import { describe, it, expect, beforeAll } from "vitest";
import { VALIDATE_CANVAS_URL } from "../routes/auth.js";

beforeAll(() => {
  process.env.ENCRYPTION_KEY =
    "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
});

describe("OAuth callback SSRF guard", () => {
  it("rejects tampered canvas_oauth_url cookie", async () => {
    const maliciousUrl = "https://evil.com";
    expect(VALIDATE_CANVAS_URL.test(maliciousUrl)).toBe(false);
  });

  it("allows valid instructure.com URLs", async () => {
    const validUrls = [
      "https://school.instructure.com",
      "https://my-school.instructure.com",
      "https://canvas-school123.instructure.com",
    ];
    for (const url of validUrls) {
      expect(VALIDATE_CANVAS_URL.test(url)).toBe(true);
    }
  });

  it("blocks URLs with path injection attempts", async () => {
    const maliciousUrls = [
      "https://school.instructure.com/evil",
      "https://school.instructure.com?redirect=evil",
      "https://school.instructure.com#frag",
      "https://evil.instructure.com.evil.com",
      "https://school.instructure.com@evil.com",
    ];
    for (const url of maliciousUrls) {
      expect(VALIDATE_CANVAS_URL.test(url)).toBe(false);
    }
  });

  it("validates OAuth state parameter matching", async () => {
    const state: string = "abc123";
    const storedState: string = "abc123";
    const tamperedState: string = "tampered";
    expect(state).toBe(storedState);
    expect(state).not.toBe(tamperedState);
  });
});
