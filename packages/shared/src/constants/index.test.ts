import { describe, expect, it } from "vitest";
import { AuditAction, UserRole, PERMISSIONS, ROLE_PERMISSIONS, hasPermission } from "./index";

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

describe('photo audit actions', () => {
  it('keeps the personal and group photo audit values stable', () => {
    expect(AuditAction.AVATAR_REMOVED).toBe('AVATAR_REMOVED');
    expect(AuditAction.GROUP_AVATAR_UPDATED).toBe('GROUP_AVATAR_UPDATED');
    expect(AuditAction.GROUP_AVATAR_REMOVED).toBe('GROUP_AVATAR_REMOVED');
  });
});
