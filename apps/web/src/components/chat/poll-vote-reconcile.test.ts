/** @vitest-environment jsdom */

import { createElement, type ComponentType, type ReactNode } from "react";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageType, PollChartType } from "@cms/shared";
import { messageService } from "@/lib/api/services/message-service";
import type { ChatMessage, PollData } from "@/lib/api/services/message-service";
import { ChatThread } from "./chat-thread";

const mocks = vi.hoisted(() => ({ searchParams: new URLSearchParams() }));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) =>
    createElement("a", { href, ...props }, children),
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => mocks.searchParams, usePathname: () => "/chat/group-1" }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), custom: vi.fn() } }));
vi.mock("@/hooks/use-chat-socket", () => ({ useChatSocket: vi.fn() }));
vi.mock("@/hooks/use-confirm", () => ({ useConfirm: () => [vi.fn(), null] }));
vi.mock("@/components/groups/group-members-dialog", () => ({
  GroupMembersDialog: ({ trigger }: { trigger: ReactNode }) => createElement("div", null, trigger),
}));
vi.mock("@/components/layout/theme-toggle", () => ({ ThemeToggle: () => null }));
vi.mock("@/components/layout/user-menu", () => ({ UserMenu: () => null }));
vi.mock("@/components/chat/join-toast", () => ({ JoinToast: () => null }));
vi.mock("@/components/chat/message-bubble", () => ({ MessageBubble: () => null }));
vi.mock("@/components/chat/poll-form-dialog", () => ({ PollFormDialog: () => null }));
vi.mock("@/components/chat/open-question-form-dialog", () => ({ OpenQuestionFormDialog: () => null }));
vi.mock("@/components/chat/open-question-message", () => ({ OpenQuestionMessage: () => null }));
vi.mock("@/components/chat/word-cloud-form-dialog", () => ({ WordCloudFormDialog: () => null }));
vi.mock("@/components/chat/word-cloud-message", () => ({ WordCloudMessage: () => null }));
vi.mock("@/components/chat/scale-form-dialog", () => ({ ScaleFormDialog: () => null }));
vi.mock("@/components/chat/scale-message", () => ({ ScaleMessage: () => null }));

// Each case mounts the full ChatThread; under a loaded full-suite run that can
// exceed the 5s default even though it takes well under 1s alone.
vi.setConfig({ testTimeout: 30_000 });

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const TEXTS = ["Option A", "Option B", "Option C", "Option D", "Option E"];

function pollState(votes: number[], myVote: string | null): PollData {
  return {
    id: "poll-1",
    question: "Which one?",
    chartType: PollChartType.BAR,
    allowMultiple: false,
    options: TEXTS.map((text, i) => ({ id: `o${i}`, text, voteCount: votes[i] })),
    totalVotes: votes.reduce((a, b) => a + b, 0),
    myVote,
  };
}

function message(poll: PollData): ChatMessage {
  return {
    id: "msg-1",
    content: "Which one?",
    type: MessageType.POLL,
    groupId: "group-1",
    senderId: "coach",
    sender: { id: "coach", name: "Coach", email: null, role: "MENTOR", avatarUrl: null, status: "ONLINE" },
    attachmentUrl: null,
    attachmentName: null,
    isPinned: false,
    isEdited: false,
    isDeleted: false,
    createdAt: "2026-10-12T09:00:00.000Z",
    updatedAt: "2026-10-12T09:00:00.000Z",
    poll,
  } as unknown as ChatMessage;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

function mount(initial: PollData) {
  const Thread = ChatThread as unknown as ComponentType<Record<string, unknown>>;
  return render(
    createElement(Thread, {
      groupId: "group-1", groupName: "Cohort", groupDescription: null, memberCount: 3,
      currentUserId: "coach", canManage: true, groupCode: null,
      initialMessages: [message(initial)], initialHasMore: false, backHref: "/dashboard",
    })
  );
}

const answers = () => within(screen.getByTestId("poll-answer-list")).getAllByRole("button");
const selectedIndex = () => answers().findIndex((b) => b.getAttribute("aria-pressed") === "true");
const votesShown = () => answers().map((b) => Number(b.textContent?.match(/(\d+) votes?/)?.[1]));
const refresh = () => act(async () => { window.dispatchEvent(new Event("focus")); });

describe("a single vote produces a single, stable reaction", () => {
  it("one click calls the vote API exactly once", async () => {
    vi.spyOn(messageService, "list").mockResolvedValue({ success: true, data: { messages: [], hasMore: false } } as never);
    const vote = vi.spyOn(messageService, "votePoll").mockResolvedValue({
      success: true,
      data: { poll: pollState([4, 5, 3, 5, 2], "o3") },
    } as never);
    mount(pollState([4, 5, 4, 4, 2], "o2"));

    await userEvent.setup({ delay: null }).click(answers()[3]);

    await waitFor(() => expect(selectedIndex()).toBe(3));
    expect(vote).toHaveBeenCalledTimes(1);
    expect(vote).toHaveBeenCalledWith("group-1", "msg-1", { optionId: "o3" });
  });

  it("a second click while the first vote is in flight is not sent", async () => {
    vi.spyOn(messageService, "list").mockResolvedValue({ success: true, data: { messages: [], hasMore: false } } as never);
    const gate = deferred<unknown>();
    const vote = vi.spyOn(messageService, "votePoll").mockReturnValue(gate.promise as never);
    mount(pollState([4, 5, 4, 4, 2], null));
    const user = userEvent.setup({ delay: null });

    await user.click(answers()[3]);
    await user.click(answers()[3]);
    await user.click(answers()[1]);

    expect(vote).toHaveBeenCalledTimes(1);
    await act(async () => { gate.resolve({ success: true, data: { poll: pollState([4, 5, 4, 5, 2], "o3") } }); });
  });

  it("re-selecting the option you already chose sends nothing", async () => {
    vi.spyOn(messageService, "list").mockResolvedValue({ success: true, data: { messages: [], hasMore: false } } as never);
    const vote = vi.spyOn(messageService, "votePoll");
    mount(pollState([4, 5, 4, 4, 2], "o2"));
    await userEvent.setup({ delay: null }).click(answers()[2]);
    expect(vote).not.toHaveBeenCalled();
  });

  it("a refresh that started BEFORE the vote cannot roll the poll back (stale response)", async () => {
    const before = pollState([4, 5, 4, 4, 2], "o2"); // what the server said before the vote
    const after = pollState([4, 5, 3, 5, 2], "o3"); // after voting for D
    const staleRefresh = deferred<unknown>();
    const list = vi.spyOn(messageService, "list").mockReturnValueOnce(staleRefresh.promise as never);
    vi.spyOn(messageService, "votePoll").mockResolvedValue({ success: true, data: { poll: after } } as never);
    mount(before);

    await refresh(); // request leaves now, reading the pre-vote state
    expect(list).toHaveBeenCalledTimes(1);

    await userEvent.setup({ delay: null }).click(answers()[3]);
    await waitFor(() => expect(selectedIndex()).toBe(3));
    expect(votesShown()).toEqual([4, 5, 3, 5, 2]);

    // The slow, stale response finally lands.
    await act(async () => {
      staleRefresh.resolve({ success: true, data: { messages: [message(before)], hasMore: false } });
    });

    // Nothing moves: option C does not grow back, D does not shrink, selection holds.
    expect(votesShown()).toEqual([4, 5, 3, 5, 2]);
    expect(selectedIndex()).toBe(3);
  });

  it("a refresh requested AFTER the vote is trusted, so real changes by others still arrive", async () => {
    const before = pollState([4, 5, 4, 4, 2], "o2");
    const after = pollState([4, 5, 3, 5, 2], "o3");
    const othersVoted = pollState([4, 8, 3, 5, 2], "o3"); // three more people chose B
    vi.spyOn(messageService, "votePoll").mockResolvedValue({ success: true, data: { poll: after } } as never);
    const list = vi.spyOn(messageService, "list");
    list.mockResolvedValue({ success: true, data: { messages: [message(before)], hasMore: false } } as never);
    mount(before);

    await userEvent.setup({ delay: null }).click(answers()[3]);
    await waitFor(() => expect(selectedIndex()).toBe(3));

    list.mockResolvedValue({ success: true, data: { messages: [message(othersVoted)], hasMore: false } } as never);
    await refresh();

    await waitFor(() => expect(votesShown()).toEqual([4, 8, 3, 5, 2]));
    expect(selectedIndex()).toBe(3);
  });

  it("rapid consecutive votes stay correct while slow refreshes race them", async () => {
    const s0 = pollState([4, 5, 3, 4, 2], null);
    const afterB = pollState([4, 6, 3, 4, 2], "o1");
    const afterD = pollState([4, 5, 3, 5, 2], "o3");
    const stale1 = deferred<unknown>();
    const stale2 = deferred<unknown>();
    const list = vi.spyOn(messageService, "list")
      .mockReturnValueOnce(stale1.promise as never)
      .mockReturnValueOnce(stale2.promise as never);
    const vote = vi.spyOn(messageService, "votePoll")
      .mockResolvedValueOnce({ success: true, data: { poll: afterB } } as never)
      .mockResolvedValueOnce({ success: true, data: { poll: afterD } } as never);
    mount(s0);
    const user = userEvent.setup({ delay: null });

    await refresh(); // refresh #1 leaves with s0
    await user.click(answers()[1]); // vote B
    await waitFor(() => expect(selectedIndex()).toBe(1));
    await act(async () => { stale1.resolve({ success: true, data: { messages: [message(s0)], hasMore: false } }); });
    expect(votesShown()).toEqual([4, 6, 3, 4, 2]);

    await refresh(); // refresh #2 leaves with afterB...
    expect(list).toHaveBeenCalledTimes(2);
    await user.click(answers()[3]); // ...then vote D
    await waitFor(() => expect(selectedIndex()).toBe(3));
    await act(async () => { stale2.resolve({ success: true, data: { messages: [message(afterB)], hasMore: false } }); });

    expect(votesShown()).toEqual([4, 5, 3, 5, 2]);
    expect(selectedIndex()).toBe(3);
    expect(vote).toHaveBeenCalledTimes(2);
  });
});
