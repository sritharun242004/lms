/** @vitest-environment jsdom */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, render as renderComponent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessageType, PollChartType, UserRole, UserStatus } from "@cms/shared";
import { messageService } from "@/lib/api/services/message-service";
import type { ChatMessage, PollData } from "@/lib/api/services/message-service";
import { PollMessage } from "./poll-message";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const message: ChatMessage = {
  id: "message-1",
  content: "Biggest barrier?",
  type: MessageType.POLL,
  groupId: "group-1",
  senderId: "coach-1",
  sender: {
    id: "coach-1",
    name: "Asha Coach",
    email: "asha@example.com",
    role: UserRole.MENTOR,
    avatarUrl: null,
    status: UserStatus.ONLINE,
  },
  attachmentUrl: null,
  attachmentName: null,
  attachment: null,
  isPinned: false,
  isEdited: false,
  isDeleted: false,
  createdAt: "2026-08-18T09:00:00.000Z",
  updatedAt: "2026-08-18T09:00:00.000Z",
  poll: null,
  wordCloud: null,
};

function buildPoll(chartType: PollChartType, votes: number[], myVote: string | null = null): PollData {
  return {
    id: "poll-1",
    question: "Biggest barrier?",
    chartType,
    allowMultiple: false,
    options: votes.map((voteCount, i) => ({ id: `option-${i}`, text: `Option ${i}`, voteCount })),
    totalVotes: votes.reduce((sum, count) => sum + count, 0),
    myVote,
  };
}

function props(poll: PollData, onVoted = vi.fn()) {
  return { message, poll, groupId: "group-1", isOwn: false, onVoted, onDelete: vi.fn() };
}

describe("PollMessage results", () => {
  it("shows the percentage and vote count for every option, including zero-vote ones", () => {
    const html = renderToStaticMarkup(
      createElement(PollMessage, props(buildPoll(PollChartType.BAR, [3, 1, 0])))
    );

    expect(html).toContain("75%");
    expect(html).toContain("3 votes");
    expect(html).toContain("25%");
    expect(html).toContain("1 vote<");
    expect(html).toContain("0%");
    expect(html).toContain("0 votes");
    expect(html).toContain("4 votes");
  });

  it("reports 0% everywhere when nobody has voted", () => {
    const html = renderToStaticMarkup(
      createElement(PollMessage, props(buildPoll(PollChartType.DONUT, [0, 0])))
    );

    expect(html.match(/>0%</g)).toHaveLength(2);
    expect(html).not.toContain("NaN");
  });

  it("draws one bar per option for bar polls and no separate chart", () => {
    renderComponent(createElement(PollMessage, props(buildPoll(PollChartType.BAR, [2, 2, 0, 0, 0]))));

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(5);
    for (const button of buttons) {
      expect(button.querySelector(".bg-muted")).not.toBeNull();
    }
    expect(document.querySelector(".aspect-square")).toBeNull();
  });

  it.each([PollChartType.DONUT, PollChartType.PIE])(
    "keys each option to its slice colour for %s polls",
    (chartType) => {
      // jsdom has no ResizeObserver, which Recharts' ResponsiveContainer needs.
      vi.stubGlobal(
        "ResizeObserver",
        class {
          observe() {}
          unobserve() {}
          disconnect() {}
        }
      );
      renderComponent(createElement(PollMessage, props(buildPoll(chartType, [2, 1, 0]))));

      expect(document.querySelector(".aspect-square")).not.toBeNull();
      const swatches = screen
        .getAllByRole("button")
        .map((button) => button.querySelector<HTMLElement>("[style*='background-color']"));
      expect(swatches.map((swatch) => swatch?.style.backgroundColor)).toEqual([
        "var(--chart-1)",
        "var(--chart-2)",
        "var(--chart-3)",
      ]);
    }
  );

  it("marks the viewer's choice and submits a vote for another option", async () => {
    const user = userEvent.setup();
    const onVoted = vi.fn();
    const voted = buildPoll(PollChartType.BAR, [1, 2], "option-1");
    vi.spyOn(messageService, "votePoll").mockResolvedValue({ success: true, data: { poll: voted } });

    renderComponent(
      createElement(PollMessage, props(buildPoll(PollChartType.BAR, [2, 1], "option-0"), onVoted))
    );

    const [first, second] = screen.getAllByRole("button");
    expect(first.getAttribute("aria-pressed")).toBe("true");
    expect(second.getAttribute("aria-pressed")).toBe("false");

    await user.click(second);

    expect(messageService.votePoll).toHaveBeenCalledWith("group-1", "message-1", {
      optionId: "option-1",
    });
    await waitFor(() => expect(onVoted).toHaveBeenCalledWith(voted));
  });
});
