import { describe, expect, it } from "vitest";
import {
  canonicalLoginPath,
  parseAuthPortal,
  portalForRole,
  safePortalDestination,
  sanitizeReturnPath,
} from "./portal-navigation";

describe("portal navigation safety", () => {
  it("allows only a same-origin path beginning with exactly one slash", () => {
    expect(sanitizeReturnPath("/chat/group-1?tab=media", "/dashboard")).toBe("/chat/group-1?tab=media");
    expect(sanitizeReturnPath("/questions?returnTo=%2Fchat%2Fgroup-1", "/dashboard")).toBe("/questions?returnTo=%2Fchat%2Fgroup-1");
  });

  it.each([
    undefined,
    "",
    "https://evil.example/phish",
    "//evil.example/phish",
    "\\evil.example\\phish",
    "/\\evil.example/phish",
    "javascript:alert(1)",
    "/javascript:alert(1)",
    "/%2F%2Fevil.example",
    "/%25252F%25252Fevil.example",
    "/%5Cevil.example",
    " /chat/group-1",
    "/chat/group-1\n",
  ])("rejects unsafe return path %s", (value) => {
    expect(sanitizeReturnPath(value, "/dashboard")).toBe("/dashboard");
  });

  it("constrains safe destinations to routes available to the selected portal", () => {
    expect(safePortalDestination("participant", "/chat/group-1")).toBe("/chat/group-1");
    expect(safePortalDestination("participant", "/admin/dashboard")).toBe("/dashboard");
    expect(safePortalDestination("participant", "/chat/../admin/coaches")).toBe("/dashboard");
    expect(safePortalDestination("participant", "/chat/%2e%2e/admin/coaches")).toBe("/dashboard");
    expect(safePortalDestination("coach", "/questions?returnTo=%2Fchat%2Fgroup-1")).toBe("/questions?returnTo=%2Fchat%2Fgroup-1");
    expect(safePortalDestination("coach", "/admin/coaches")).toBe("/dashboard");
    expect(safePortalDestination("super-admin", "/admin/coaches")).toBe("/admin/coaches");
    expect(safePortalDestination("super-admin", "javascript:alert(1)")).toBe("/dashboard");
    expect(sanitizeReturnPath("/admin/coaches", "/chat", ["/chat"])).toBe("/chat");
  });

  it("maps validated portal and role values to canonical login routes", () => {
    expect(parseAuthPortal("coach")).toBe("coach");
    expect(parseAuthPortal("super-admin")).toBe("super-admin");
    expect(parseAuthPortal("javascript:alert(1)")).toBe("participant");
    expect(canonicalLoginPath("participant")).toBe("/participant/login");
    expect(canonicalLoginPath("coach")).toBe("/coach/login");
    expect(canonicalLoginPath("super-admin")).toBe("/super-admin/login");
    expect(portalForRole("MENTEE")).toBe("participant");
    expect(portalForRole("MENTOR")).toBe("coach");
    expect(portalForRole("ADMIN")).toBe("super-admin");
  });
});
