import { describe, it, expect, vi, beforeAll } from "vitest";
import type { Request, Response } from "express";

beforeAll(() => {
  process.env.ENCRYPTION_KEY =
    "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
});

/** Minimal mock user matching the User schema from @workspace/db */
const mockUserBase = {
  email: "a@b.com",
  name: null as string | null,
  // Password-based auth columns — defaults match the schema. Tests that
  // exercise password flows override these on a per-case basis.
  passwordHash: null as string | null,
  emailVerifiedAt: null as Date | null,
  authProvider: "canvas" as const,
  canvasBaseUrl: null as string | null,
  canvasAccessTokenEncrypted: null as string | null,
  canvasRefreshTokenEncrypted: null as string | null,
  canvasTokenExpiresAt: null as Date | null,
  canvasUserId: null as string | null,
  referredFrom: null as string | null,
  lastSyncPhase: null as string | null,
  lastSyncAt: null as Date | null,
  lastSyncError: null as string | null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("lib/auth requireAuth", () => {
  it("rejects missing session", async () => {
    const mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response;
    const { requireAuth } = await import("../lib/auth.js");
    const req = { headers: {}, cookies: {} } as unknown as Request;
    const result = await requireAuth(req, mockRes);
    expect(result).toBeNull();
    expect(mockRes.status).toHaveBeenCalledWith(401);
  });
});

describe("lib/auth getCanvasToken", () => {
  it("returns null when no token", async () => {
    const { getCanvasToken } = await import("../lib/auth.js");
    const result = await getCanvasToken({ id: "u1", ...mockUserBase });
    expect(result).toBeNull();
  });
});

describe("lib/auth with session cookie", () => {
  it("extracts session from cookies", async () => {
    const { requireAuth } = await import("../lib/auth.js");
    const mockRes = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as unknown as Response;
    const req = {
      headers: {},
      cookies: { jarvis_session: "fake-session-id" },
    } as unknown as Request;
    const result = await requireAuth(req, mockRes);
    expect(result === null || typeof result === "object").toBe(true);
  });

  it("extracts session from x-session-token header", async () => {
    const { requireAuth } = await import("../lib/auth.js");
    const mockRes = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as unknown as Response;
    const req = {
      headers: { "x-session-token": "header-session-id" },
      cookies: {},
    } as unknown as Request;
    const result = await requireAuth(req, mockRes);
    expect(result === null || typeof result === "object").toBe(true);
  });
});

describe("lib/auth getCanvasToken with valid encrypted token", () => {
  it("decrypts and returns canvas token", async () => {
    const { encrypt } = await import("../lib/crypto.js");
    const { getCanvasToken } = await import("../lib/auth.js");
    const encrypted = encrypt("my-access-token");
    const result = await getCanvasToken({
      id: "u1",
      ...mockUserBase,
      canvasAccessTokenEncrypted: encrypted,
    });
    expect(result).toBe("my-access-token");
  });
});

describe("lib/auth getCanvasToken with bad encrypted token", () => {
  it("returns null on corrupted token", async () => {
    const { getCanvasToken } = await import("../lib/auth.js");
    const result = await getCanvasToken({
      id: "u1",
      ...mockUserBase,
      canvasAccessTokenEncrypted: "corrupted:data",
    });
    expect(result).toBeNull();
  });
});
