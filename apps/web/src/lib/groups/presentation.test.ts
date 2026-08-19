import { describe, expect, it } from "vitest";
import type { GroupCard } from "@/lib/api/services/group-service";
import { formatLastActive, getVisibleGroups } from "@/lib/groups/presentation";

const group = (overrides: Partial<GroupCard>): GroupCard => ({
  id: "group-1",
  name: "Alpha cohort",
  description: null,
  wallpaperUrl: null,
  avatarUrl: null,
  createdAt: "2026-08-01T10:00:00.000Z",
  lastActivityAt: "2026-08-01T10:00:00.000Z",
  mentorName: "Asha Coach",
  memberCount: 4,
  memberIds: [],
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

describe("formatLastActive", () => {
  const now = new Date("2026-08-19T12:00:00.000Z");

  it("shows minutes within the first hour", () => {
    expect(formatLastActive("2026-08-19T11:55:00.000Z", now)).toBe("5m ago");
  });

  it("shows hours within the last 24h", () => {
    expect(formatLastActive("2026-08-19T05:00:00.000Z", now)).toBe("7h ago");
  });

  it("shows days once past 24h", () => {
    expect(formatLastActive("2026-08-17T12:00:00.000Z", now)).toBe("2d ago");
  });

  it("shows weeks once past 7 days", () => {
    expect(formatLastActive("2026-08-05T12:00:00.000Z", now)).toBe("2w ago");
  });

  it("shows months once past 30 days", () => {
    expect(formatLastActive("2026-05-19T12:00:00.000Z", now)).toBe("3mo ago");
  });

  it("shows years once past 365 days", () => {
    expect(formatLastActive("2024-08-19T12:00:00.000Z", now)).toBe("2y ago");
  });
});
