import { describe, expect, it } from "vitest";
import { UserRole, PERMISSIONS, ROLE_PERMISSIONS, hasPermission } from "./index";

describe("hasPermission", () => {
  it("grants admins every permission", () => {
    for (const permission of Object.values(PERMISSIONS)) {
      expect(hasPermission(UserRole.ADMIN, permission)).toBe(true);
    }
  });

  it("lets mentors manage messages but not other mentors", () => {
    expect(hasPermission(UserRole.MENTOR, PERMISSIONS.MESSAGE_DELETE)).toBe(true);
    expect(hasPermission(UserRole.MENTOR, PERMISSIONS.MENTOR_DELETE)).toBe(false);
  });

  it("limits mentees to read-only message actions", () => {
    expect(hasPermission(UserRole.MENTEE, PERMISSIONS.MESSAGE_READ)).toBe(true);
    expect(hasPermission(UserRole.MENTEE, PERMISSIONS.MESSAGE_COPY)).toBe(true);
    expect(hasPermission(UserRole.MENTEE, PERMISSIONS.MESSAGE_SEND)).toBe(false);
    expect(hasPermission(UserRole.MENTEE, PERMISSIONS.MESSAGE_DELETE)).toBe(false);
  });

  it("never grants a permission absent from the role's list", () => {
    for (const role of Object.values(UserRole)) {
      for (const permission of Object.values(PERMISSIONS)) {
        expect(hasPermission(role, permission)).toBe(
          ROLE_PERMISSIONS[role].includes(permission)
        );
      }
    }
  });
});
