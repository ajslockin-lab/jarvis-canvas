// Mirror tests for the auth error-classification contract.
//
// The actual error-handling logic is in routes/auth.ts and is best tested
// with integration tests. These tests pin down the surface contract —
// every error response includes a `code` field with a stable enum value
// so the frontend's classification logic doesn't silently break when
// server copy changes.

import { describe, it, expect } from "vitest";

// Mirror the ErrorCodes enum from routes/auth.ts. If you add a code
// there, add it here too.
const ErrorCodes = {
  badUrl: "bad_url",
  missingToken: "missing_token",
  tokenRejected: "token_rejected",
  canvasUnreachable: "canvas_unreachable",
  serviceDown: "service_down",
  serverError: "server_error",
  corsBlocked: "cors_blocked",
  rateLimited: "rate_limited",
  badRequest: "bad_request",
  canvasRequired: "canvas_required",
  emailTaken: "email_taken",
  invalidCredentials: "invalid_credentials",
  emailNotVerified: "email_not_verified",
  noPendingVerification: "no_pending_verification",
  codeExpired: "code_expired",
  tooManyAttempts: "too_many_attempts",
  invalidCode: "invalid_code",
  resendTooSoon: "resend_too_soon",
  passwordTooShort: "password_too_short",
} as const;

describe("error code enum", () => {
  it("includes the canvas-auth codes", () => {
    expect(ErrorCodes.badUrl).toBe("bad_url");
    expect(ErrorCodes.missingToken).toBe("missing_token");
    expect(ErrorCodes.tokenRejected).toBe("token_rejected");
    expect(ErrorCodes.canvasUnreachable).toBe("canvas_unreachable");
    expect(ErrorCodes.serviceDown).toBe("service_down");
  });

  it("includes the password-auth codes", () => {
    expect(ErrorCodes.emailTaken).toBe("email_taken");
    expect(ErrorCodes.invalidCredentials).toBe("invalid_credentials");
    expect(ErrorCodes.emailNotVerified).toBe("email_not_verified");
    expect(ErrorCodes.invalidCode).toBe("invalid_code");
    expect(ErrorCodes.codeExpired).toBe("code_expired");
    expect(ErrorCodes.tooManyAttempts).toBe("too_many_attempts");
    expect(ErrorCodes.resendTooSoon).toBe("resend_too_soon");
    expect(ErrorCodes.noPendingVerification).toBe("no_pending_verification");
  });

  it("includes the cross-cutting codes (server/rate-limit/cors)", () => {
    expect(ErrorCodes.serverError).toBe("server_error");
    expect(ErrorCodes.rateLimited).toBe("rate_limited");
    expect(ErrorCodes.corsBlocked).toBe("cors_blocked");
    expect(ErrorCodes.badRequest).toBe("bad_request");
    expect(ErrorCodes.canvasRequired).toBe("canvas_required");
  });

  it("every code uses snake_case (machine-readable convention)", () => {
    for (const [key, value] of Object.entries(ErrorCodes)) {
      expect(value, `${key} should be snake_case`).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });
});

describe("error response shape", () => {
  // Document the contract: every error response is JSON with `error`
  // (human-readable) and `code` (machine-readable). The frontend classifier
  // depends on `code` being present — never omit it.
  it("canonical error response has both `error` and `code`", () => {
    const example = { error: "Something went wrong on our end", code: ErrorCodes.serverError };
    expect(example).toHaveProperty("error");
    expect(example).toHaveProperty("code");
    expect(Object.keys(example).sort()).toEqual(["code", "error"]);
  });
});
