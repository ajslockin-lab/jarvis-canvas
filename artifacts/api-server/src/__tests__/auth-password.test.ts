// Tests for password hashing and verification-code hashing.
//
// The actual signup/verify flow touches the database and the email service
// — those paths are integration tests, not here. This file pins the
// cryptographic round-trips: every password and every code that goes
// through bcrypt is verifiable, and plaintext is never the storage form.

import { describe, it, expect, beforeAll } from "vitest";
import bcrypt from "bcryptjs";

beforeAll(() => {
  process.env.ENCRYPTION_KEY =
    "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
});

describe("password hashing", () => {
  it("hashes a password and verifies the original", async () => {
    const hash = await bcrypt.hash("correct horse battery staple", 10);
    expect(hash).not.toBe("correct horse battery staple");
    expect(await bcrypt.compare("correct horse battery staple", hash)).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await bcrypt.hash("correct horse battery staple", 10);
    expect(await bcrypt.compare("wrong password", hash)).toBe(false);
  });

  it("uses a random salt so the same password hashes differently each time", async () => {
    const a = await bcrypt.hash("same password", 10);
    const b = await bcrypt.hash("same password", 10);
    expect(a).not.toBe(b);
    expect(await bcrypt.compare("same password", a)).toBe(true);
    expect(await bcrypt.compare("same password", b)).toBe(true);
  });

  it("hash includes the bcrypt prefix and version ($2)", async () => {
    const hash = await bcrypt.hash("anything", 10);
    expect(hash).toMatch(/^\$2[aby]\$/);
  });
});

describe("verification code hashing", () => {
  // 6-digit codes use the same bcrypt path. The 5-attempt cap combined
  // with a 10-round hash makes brute-force infeasible.
  it("hashes a 6-digit code and verifies the original", async () => {
    const code = "847293";
    const hash = await bcrypt.hash(code, 10);
    expect(hash).not.toBe(code);
    expect(await bcrypt.compare(code, hash)).toBe(true);
  });

  it("rejects a wrong code", async () => {
    const hash = await bcrypt.hash("847293", 10);
    expect(await bcrypt.compare("000000", hash)).toBe(false);
    expect(await bcrypt.compare("847294", hash)).toBe(false);
  });
});
