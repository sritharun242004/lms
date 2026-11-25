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
          avatarUrl: null,
          createdAt: "2026-08-18T00:00:00.000Z",
          lastActivityAt: "2026-08-18T00:00:00.000Z",
          mentorName: "Asha Coach",
          memberCount: 4,
          memberIds: [],
          inviteCode: null,
          canManage: true,
          promptBotEnabled: false,
        },
        onChanged: vi.fn(),
      })
    );

    expect(screen.getByRole("link", { name: /open chat/i }).getAttribute("href")).toBe("/chat/group-42");
  });

  it("shows a green 'Active now' indicator instead of last-active time when someone is online", () => {
    render(
      createElement(GroupCard, {
        group: {
          id: "group-42",
          name: "Design cohort",
          description: null,
          wallpaperUrl: null,
          avatarUrl: null,
          createdAt: "2026-08-18T00:00:00.000Z",
          lastActivityAt: "2026-08-18T00:00:00.000Z",
          mentorName: "Asha Coach",
          memberCount: 4,
          memberIds: ["user-1"],
          inviteCode: null,
          canManage: true,
          promptBotEnabled: false,
        },
        onChanged: vi.fn(),
        isActive: true,
      })
    );

    expect(screen.getByText(/active now/i)).toBeTruthy();
    expect(screen.queryByText(/last active/i)).toBeNull();
  });

  it("falls back to a relative last-active time when nobody is online", () => {
    render(
      createElement(GroupCard, {
        group: {
          id: "group-42",
          name: "Design cohort",
          description: null,
          wallpaperUrl: null,
          avatarUrl: null,
          createdAt: "2026-08-18T00:00:00.000Z",
          lastActivityAt: "2026-08-18T00:00:00.000Z",
          mentorName: "Asha Coach",
          memberCount: 4,
          memberIds: ["user-1"],
          inviteCode: null,
          canManage: true,
          promptBotEnabled: false,
        },
        onChanged: vi.fn(),
        isActive: false,
      })
    );

    expect(screen.getByText(/last active/i)).toBeTruthy();
    expect(screen.queryByText(/active now/i)).toBeNull();
  });

  it("shows the Prompt Bot switch only where the viewer may change it (admins)", () => {
    const group = {
      id: "group-7", name: "Cohort", description: null, wallpaperUrl: null, avatarUrl: null,
      createdAt: "2026-08-18T00:00:00.000Z", lastActivityAt: "2026-08-18T00:00:00.000Z",
      mentorName: "Asha Coach", memberCount: 2, memberIds: [], inviteCode: null,
      canManage: true, promptBotEnabled: true,
    };
    render(createElement(GroupCard, { group, onChanged: vi.fn() }));
    expect(screen.queryByRole("switch", { name: "Prompt Bot for participants" })).toBeNull();
    cleanup();

    render(createElement(GroupCard, { group, onChanged: vi.fn(), canTogglePromptBot: true }));
    const toggle = screen.getByRole("switch", { name: "Prompt Bot for participants" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
  });
});
