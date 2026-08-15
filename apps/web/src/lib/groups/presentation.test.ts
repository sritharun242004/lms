import { describe, expect, it } from "vitest";
import type { GroupCard } from "@/lib/api/services/group-service";
import { getVisibleGroups } from "@/lib/groups/presentation";

const group = (overrides: Partial<GroupCard>): GroupCard => ({
  id: "group-1",
  name: "Alpha cohort",
  description: null,
  wallpaperUrl: null,
  createdAt: "2026-08-01T10:00:00.000Z",
  lastActivityAt: "2026-08-01T10:00:00.000Z",
  mentorName: "Asha Coach",
  memberCount: 4,
  inviteCode: null,
  canManage: true,
  ...overrides,
});

describe("getVisibleGroups", () => {
  it("puts the most recently active group first", () => {
    const groups = [
      group({ id: "older", lastActivityAt: "2026-08-02T10:00:00.000Z" }),
      group({ id: "newer", lastActivityAt: "2026-08-05T10:00:00.000Z" }),
    ];

    expect(getVisibleGroups(groups, "").map((item) => item.id)).toEqual(["newer", "older"]);
  });

  it("searches group names, descriptions, coaches, and invite codes without changing recency order", () => {
    const groups = [
      group({ id: "alpha", description: "Leadership practice" }),
      group({
        id: "beta",
        name: "Beta cohort",
        mentorName: "Mira Mentor",
        lastActivityAt: "2026-08-06T10:00:00.000Z",
        inviteCode: { id: "invite-1", code: "CMS-MIRA", isActive: true, usageCount: 0 },
      }),
    ];

    expect(getVisibleGroups(groups, "mira").map((item) => item.id)).toEqual(["beta"]);
    expect(getVisibleGroups(groups, "leadership").map((item) => item.id)).toEqual(["alpha"]);
    expect(getVisibleGroups(groups, "cms-mira").map((item) => item.id)).toEqual(["beta"]);
  });
});
