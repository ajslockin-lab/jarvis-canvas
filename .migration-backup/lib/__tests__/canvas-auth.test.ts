import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildAuthorizeUrl } from "../canvas-auth";

beforeEach(() => {
  vi.stubEnv("CANVAS_CLIENT_ID", "test-client-id");
  vi.stubEnv("CANVAS_CLIENT_SECRET", "test-client-secret");
  vi.stubEnv("NEXTAUTH_URL", "http://localhost:3000");
});

describe("buildAuthorizeUrl", () => {
  it("builds a valid Canvas OAuth authorize URL", () => {
    const url = buildAuthorizeUrl("https://school.instructure.com", "test-state");
    expect(url).toContain("https://school.instructure.com/login/oauth2/auth");
    expect(url).toContain("client_id=test-client-id");
    expect(url).toContain("response_type=code");
    expect(url).toContain("state=test-state");
    expect(url).toContain("redirect_uri=");
    expect(url).toContain("scope=");
  });

  it("strips trailing slash from canvas URL", () => {
    const url = buildAuthorizeUrl("https://school.instructure.com/", "state");
    expect(url).toContain("https://school.instructure.com/login");
    expect(url).not.toContain("instructure.com//login");
  });
});

describe("exchangeCodeForToken", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("posts to the token endpoint and returns tokens", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: "at-123",
          refresh_token: "rt-456",
          expires_in: 3600,
          user: { id: "42" },
        }),
    });

    // Dynamic import to get fresh module
    const { exchangeCodeForToken } = await import("../canvas-auth");
    const result = await exchangeCodeForToken(
      "https://school.instructure.com",
      "auth-code-abc"
    );

    expect(result.accessToken).toBe("at-123");
    expect(result.refreshToken).toBe("rt-456");
    expect(result.canvasUserId).toBe("42");
    expect(result.expiresIn).toBe(3600);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const callBody = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string);
    expect(callBody.grant_type).toBe("authorization_code");
    expect(callBody.code).toBe("auth-code-abc");
  });

  it("throws on non-ok response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      statusText: "Bad Request",
      text: () => Promise.resolve("invalid code"),
    });

    const { exchangeCodeForToken } = await import("../canvas-auth");
    await expect(
      exchangeCodeForToken("https://school.instructure.com", "bad-code")
    ).rejects.toThrow();
  });
});
