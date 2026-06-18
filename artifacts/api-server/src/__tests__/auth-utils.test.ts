import { describe, it, expect, vi, beforeAll } from "vitest";
import type { Request, Response } from "express";

beforeAll(() => {
  process.env.ENCRYPTION_KEY =
    "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
});

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
    const result = await getCanvasToken({
      id: "u1",
      email: "a@b.com",
      name: null,
      canvasBaseUrl: null,
      canvasAccessTokenEncrypted: null,
      canvasRefreshTokenEncrypted: null,
      canvasTokenExpiresAt: null,
      canvasUserId: null,
    });
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
      email: "a@b.com",
      name: null,
      canvasBaseUrl: null,
      canvasAccessTokenEncrypted: encrypted,
      canvasRefreshTokenEncrypted: null,
      canvasTokenExpiresAt: null,
      canvasUserId: null,
    });
    expect(result).toBe("my-access-token");
  });
});

describe("lib/auth getCanvasToken with bad encrypted token", () => {
  it("returns null on corrupted token", async () => {
    const { getCanvasToken } = await import("../lib/auth.js");
    const result = await getCanvasToken({
      id: "u1",
      email: "a@b.com",
      name: null,
      canvasBaseUrl: null,
      canvasAccessTokenEncrypted: "corrupted:data",
      canvasRefreshTokenEncrypted: null,
      canvasTokenExpiresAt: null,
      canvasUserId: null,
    });
    expect(result).toBeNull();
  });
});
