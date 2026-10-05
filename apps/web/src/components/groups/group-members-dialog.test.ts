/** @vitest-environment jsdom */

import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { groupService } from "@/lib/api/services/group-service";
import { GroupMembersDialog } from "./group-members-dialog";

vi.mock("@/lib/api/services/group-service", () => ({ groupService: { members: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("GroupMembersDialog", () => {
  it("makes the complete 30-participant roster count visible while retaining every member", async () => {
    const members = Array.from({ length: 30 }, (_, index) => ({ id: `membership-${index + 1}`, role: "MENTEE" as const, joinedAt: "2026-10-05T00:00:00.000Z", user: { id: `user-${index + 1}`, name: `Participant ${index + 1}`, email: null, avatarUrl: null } }));
    vi.mocked(groupService.members).mockResolvedValue({ success: true, data: { members } });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(createElement(QueryClientProvider, { client: queryClient }, createElement(GroupMembersDialog, { groupId: "group-30", groupName: "AI Empowerment for Teams", trigger: createElement("button", null, "View participants") })));
    await userEvent.setup().click(screen.getByRole("button", { name: "View participants" }));
    expect(await screen.findByText(/30 participants/)).toBeTruthy();
    expect(screen.getByText("Participant 1")).toBeTruthy();
    expect(screen.getByText("Participant 30")).toBeTruthy();
  });
});
