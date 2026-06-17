import { describe, it, expect, beforeAll } from "vitest";

// Set a test encryption key before importing
beforeAll(() => {
  process.env.ENCRYPTION_KEY = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
});

describe("crypto", () => {
  it("encrypts and decrypts a string round-trip", async () => {
    const { encrypt, decrypt } = await import("../crypto");
    const plaintext = "my-secret-canvas-token";
    const encrypted = encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(encrypted.split(":")).toHaveLength(3);
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  it("throws if ENCRYPTION_KEY is not set", async () => {
    const original = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    const { encrypt } = await import("../crypto");
    expect(() => encrypt("test")).toThrow("ENCRYPTION_KEY");
    process.env.ENCRYPTION_KEY = original;
  });

  it("throws on corrupted ciphertext", async () => {
    const { decrypt } = await import("../crypto");
    expect(() => decrypt("invalid:data:here")).toThrow();
  });

  it("produces different ciphertext on each call (random IV)", async () => {
    const { encrypt } = await import("../crypto");
    const enc1 = encrypt("same-input");
    const enc2 = encrypt("same-input");
    expect(enc1).not.toBe(enc2);
  });
});
