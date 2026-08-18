import { describe, expect, it } from "vitest";
import { isAuthVersionCurrent, isValidJwtIdentity, isValidJwtSessionClaims } from "./auth";

describe("JWT rollout compatibility", () => {
  it("treats only a missing version as legacy zero", () => {
    expect(isAuthVersionCurrent(undefined, 0)).toBe(true);
    expect(isAuthVersionCurrent(undefined, 1)).toBe(false);
    expect(isAuthVersionCurrent(0, 0)).toBe(true);
    expect(isAuthVersionCurrent(1, 1)).toBe(true);
    expect(isAuthVersionCurrent(0, 1)).toBe(false);
    expect(isAuthVersionCurrent(null, 0)).toBe(false);
    expect(isAuthVersionCurrent("0", 0)).toBe(false);
  });

  it("still requires a non-empty user id and a known role", () => {
    expect(isValidJwtIdentity({ sub: "u1", role: "MENTOR" })).toBe(true);
    expect(isValidJwtIdentity({ sub: "", role: "MENTOR" })).toBe(false);
    expect(isValidJwtIdentity({ role: "MENTOR" })).toBe(false);
    expect(isValidJwtIdentity({ sub: "u1" })).toBe(false);
    expect(isValidJwtIdentity({ sub: "u1", role: "OWNER" })).toBe(false);
  });

  it("accepts an omitted version but rejects malformed version claims", () => {
    expect(isValidJwtSessionClaims({ sub: "u1", role: "MENTOR" })).toBe(true);
    expect(isValidJwtSessionClaims({ sub: "u1", role: "MENTOR", authVersion: 0 })).toBe(true);
    expect(isValidJwtSessionClaims({ sub: "u1", role: "MENTOR", authVersion: null })).toBe(false);
    expect(isValidJwtSessionClaims({ sub: "u1", role: "MENTOR", authVersion: "0" })).toBe(false);
  });
});
