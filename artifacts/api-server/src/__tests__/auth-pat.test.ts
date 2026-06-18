import { describe, it, expect, vi, beforeAll } from "vitest";

beforeAll(() => {
  process.env.ENCRYPTION_KEY =
    "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
});

describe("PAT (Personal Access Token) encryption", () => {
  it("encrypts PAT before storing in database", async () => {
    const { encrypt } = await import("../lib/crypto.js");
    const pat = "pat-12345-abcdef-secret";
    const encrypted = encrypt(pat);
    // Must not be plaintext
    expect(encrypted).not.toBe(pat);
    // Must be a valid encrypted format with  colon-separated parts
    expect(encrypted.split(":")).toHaveLength(3);
    // Must decrypt back to original
    const { decrypt } = await import("../lib/crypto.js");
    expect(decrypt(encrypted)).toBe(pat);
  });

  it("does not store plaintext PAT in user data object", async () => {
    const { encrypt } = await import("../lib/crypto.js");
    const pat = "secret-pat-value-123";
    const encryptedPat = encrypt(pat);
    // Simulate what auth.ts does: canvasAccessTokenEncrypted = encrypt(pat)
    const userData = { canvasAccessTokenEncrypted: encryptedPat };
    expect(userData.canvasAccessTokenEncrypted).not.toBe(pat);
    expect(userData.canvasAccessTokenEncrypted).toContain(":");
  });

  it("uses random IV so same PAT encrypts to different values", async () => {
    const { encrypt } = await import("../lib/crypto.js");
    const pat = "same-pat-every-time";
    const enc1 = encrypt(pat);
    const enc2 = encrypt(pat);
    expect(enc1).not.toBe(enc2);
    // Both must still decrypt to same value
    const { decrypt } = await import("../lib/crypto.js");
    expect(decrypt(enc1)).toBe(pat);
    expect(decrypt(enc2)).toBe(pat);
  });
});
