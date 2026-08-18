/** @vitest-environment jsdom */

import { createElement, type ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GroupCard } from "./group-card";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) =>
    createElement("a", { href, ...props }, children),
}));
vi.mock("@/hooks/use-confirm", () => ({ useConfirm: () => [vi.fn(), null] }));
vi.mock("@/components/groups/group-members-dialog", () => ({
  GroupMembersDialog: ({ trigger }: { trigger: ReactNode }) => createElement("div", null, trigger),
}));

afterEach(cleanup);

describe("dashboard group-card navigation", () => {
  it("keeps the group-specific Open chat action for manager entry", () => {
    render(
      createElement(GroupCard, {
        group: {
          id: "group-42",
          name: "Design cohort",
          description: null,
          wallpaperUrl: null,
          createdAt: "2026-08-18T00:00:00.000Z",
          lastActivityAt: "2026-08-18T00:00:00.000Z",
          mentorName: "Asha Coach",
          memberCount: 4,
          inviteCode: null,
          canManage: true,
        },
        onChanged: vi.fn(),
      })
    );

    expect(screen.getByRole("link", { name: /open chat/i }).getAttribute("href")).toBe("/chat/group-42");
  });
});
