import { describe, expect, it } from "vitest";
import { hashPassword, sign, unsign, verifyPassword } from "@/lib/auth/crypto";
import { canAccess, type Actor } from "@/lib/auth/identity";
import { toCsv, waitlistInput } from "@/lib/waitlist/service";

describe("passwords and signed cookies", () => {
  it("hashes and verifies passwords", async () => {
    const h = await hashPassword("correct horse");
    expect(h).not.toContain("correct horse");
    expect(await verifyPassword("correct horse", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });

  it("detects tampered cookie values", () => {
    const s = sign("visitor-123");
    expect(unsign(s)).toBe("visitor-123");
    expect(unsign(s.replace("visitor-123", "visitor-456"))).toBeNull();
    expect(unsign("visitor-123")).toBeNull();
    expect(unsign(undefined)).toBeNull();
  });
});

describe("session access control", () => {
  const userA: Actor = { type: "user", userId: "A", email: "a@x.com", planId: "free", anonId: null };
  const userB: Actor = { type: "user", userId: "B", email: "b@x.com", planId: "free", anonId: null };
  const anon1: Actor = { type: "anonymous", anonId: "n1" };
  const anon2: Actor = { type: "anonymous", anonId: "n2" };

  it("only the owning user can access a user session", () => {
    const s = { userId: "A", anonId: null };
    expect(canAccess(userA, s)).toBe(true);
    expect(canAccess(userB, s)).toBe(false);
    expect(canAccess(anon1, s)).toBe(false);
    expect(canAccess(null, s)).toBe(false);
  });

  it("only the owning visitor can access an anonymous session", () => {
    const s = { userId: null, anonId: "n1" };
    expect(canAccess(anon1, s)).toBe(true);
    expect(canAccess(anon2, s)).toBe(false);
    expect(canAccess(userA, s)).toBe(false);
  });

  it("a claimed session is no longer accessible anonymously", () => {
    expect(canAccess(anon1, { userId: "A", anonId: "n1" })).toBe(false);
  });
});

describe("waitlist", () => {
  it("normalises and validates email", () => {
    expect(waitlistInput.parse({ email: "  Me@Example.COM ", trackId: "x" }).email).toBe("me@example.com");
    expect(() => waitlistInput.parse({ email: "nope", trackId: "x" })).toThrow();
  });

  it("CSV export neutralises spreadsheet formulas", () => {
    const csv = toCsv([{ email: "=cmd@x.com", trackId: "t", consent: true, createdAt: new Date(0) }]);
    expect(csv).toContain(`"'=cmd@x.com"`);
    expect(csv.split("\n")[0]).toBe("email,track,consent_to_updates,created_at_utc");
  });
});
