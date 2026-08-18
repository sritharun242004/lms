/** @vitest-environment jsdom */

import { createElement, type ComponentType, type ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatThread } from "./chat-thread";

const mocks = vi.hoisted(() => ({ toastSuccess: vi.fn(), toastError: vi.fn() }));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) =>
    createElement("a", { href, ...props }, children),
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("sonner", () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError, custom: vi.fn() } }));
vi.mock("@/hooks/use-chat-socket", () => ({ useChatSocket: vi.fn() }));
vi.mock("@/hooks/use-confirm", () => ({ useConfirm: () => [vi.fn(), null] }));
vi.mock("@/components/groups/group-members-dialog", () => ({
  GroupMembersDialog: ({ trigger }: { trigger: ReactNode }) => createElement("div", null, trigger),
}));
vi.mock("@/components/layout/theme-toggle", () => ({ ThemeToggle: () => createElement("span", null, "Theme") }));
vi.mock("@/components/chat/join-toast", () => ({ JoinToast: () => null }));
vi.mock("@/components/chat/message-bubble", () => ({ MessageBubble: () => null }));
vi.mock("@/components/chat/poll-form-dialog", () => ({ PollFormDialog: () => null }));
vi.mock("@/components/chat/poll-message", () => ({ PollMessage: () => null }));
vi.mock("@/components/chat/open-question-form-dialog", () => ({ OpenQuestionFormDialog: () => null }));
vi.mock("@/components/chat/open-question-message", () => ({ OpenQuestionMessage: () => null }));
vi.mock("@/components/chat/word-cloud-form-dialog", () => ({ WordCloudFormDialog: () => null }));
vi.mock("@/components/chat/word-cloud-message", () => ({ WordCloudMessage: () => null }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
});

function renderThread(canManage: boolean, groupCode: string | null) {
  const Thread = ChatThread as unknown as ComponentType<Record<string, unknown>>;
  return render(
    createElement(Thread, {
      groupId: "group-1",
      groupName: "Design cohort",
      groupDescription: "Weekly work",
      memberCount: 4,
      currentUserId: "user-1",
      canManage,
      groupCode,
      initialMessages: [],
      initialHasMore: false,
      backHref: canManage ? "/dashboard" : null,
    })
  );
}

describe("group-code chat header", () => {
  it("shows a manager the code and announces a successful accessible copy", async () => {
    const user = userEvent.setup();
    const clipboardWrite = vi.spyOn(window.navigator.clipboard, "writeText").mockResolvedValue(undefined);
    renderThread(true, "JOIN-42");

    expect(screen.getByText("Group code")).toBeTruthy();
    expect(screen.getByText("JOIN-42")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /copy group code/i }));

    expect(clipboardWrite).toHaveBeenCalledWith("JOIN-42");
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Group code copied");
  });

  it("reports a copy error without removing the manager's code", async () => {
    const user = userEvent.setup();
    const clipboardWrite = vi
      .spyOn(window.navigator.clipboard, "writeText")
      .mockRejectedValue(new Error("Clipboard denied"));
    renderThread(true, "JOIN-42");

    await user.click(screen.getByRole("button", { name: /copy group code/i }));

    expect(clipboardWrite).toHaveBeenCalledWith("JOIN-42");
    expect(screen.getByText("JOIN-42")).toBeTruthy();
    expect(mocks.toastError).toHaveBeenCalledWith("Couldn't copy group code. Copy it manually.");
  });

  it("keeps the participant header free of a code and back link", () => {
    renderThread(false, null);

    expect(screen.queryByText("Group code")).toBeNull();
    expect(screen.queryByRole("link", { name: "Back" })).toBeNull();
  });
});
