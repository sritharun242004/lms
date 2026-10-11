/** @vitest-environment jsdom */

import { createElement, type CSSProperties, type ReactNode } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PollChartType } from "@cms/shared";
import type { PollData } from "@/lib/api/services/message-service";

const motionState = vi.hoisted(() => ({ reduced: false }));

// Render motion spans as plain spans that expose their animation props, so the
// tests assert the exact targets instead of racing real animation frames.
vi.mock("motion/react", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  return {
    useReducedMotion: () => motionState.reduced,
    motion: {
      span: ({
        initial,
        animate,
        transition,
        style,
        children,
        ...rest
      }: {
        initial?: { width: string } | false;
        animate?: { width: string };
        transition?: { duration: number };
        style?: CSSProperties;
        children?: ReactNode;
      }) =>
        React.createElement(
          "span",
          {
            ...rest,
            style: { ...style, width: animate?.width },
            "data-initial": initial ? initial.width : "none",
            "data-duration": String(transition?.duration),
          },
          children
        ),
    },
  };
});

import { PollBarResults } from "./poll-bar-results";
import { PollMessage } from "./poll-message";

beforeEach(() => {
  motionState.reduced = false;
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
  vi.unstubAllGlobals();
});

function poll(texts: string[], votes: number[], myVote: string | null = null): PollData {
  return {
    id: "poll-1",
    question: "Q",
    chartType: PollChartType.BAR,
    allowMultiple: false,
    options: texts.map((text, i) => ({ id: `o${i}`, text, voteCount: votes[i] ?? 0 })),
    totalVotes: votes.reduce((sum, v) => sum + v, 0),
    myVote,
  };
}

const labels = (n: number) => Array.from({ length: n }, (_, i) => `Option ${i + 1}`);
const show = (p: PollData, onVote = vi.fn(), isVoting = false) =>
  render(createElement(PollBarResults, { poll: p, isVoting, onVote }));

describe("PollBarResults layout", () => {
  it.each([2, 5, 10, 15, 20, 30])("shows every option, bar and result for %i options", (n) => {
    show(poll(labels(n), labels(n).map((_, i) => i)));

    expect(screen.getAllByTestId("poll-graph-row")).toHaveLength(n);
    expect(screen.getAllByTestId("poll-bar")).toHaveLength(n);
    expect(screen.getAllByRole("button")).toHaveLength(n);
    for (const text of labels(n)) {
      // once in the graph label, once in the answer card: nothing is dropped
      expect(screen.getAllByText(text).length).toBeGreaterThanOrEqual(2);
    }
  });

  it("keeps graph rows and answer cards in the same option order", () => {
    show(poll(["Zeta", "Alpha", "Mid"], [1, 5, 3]));
    const graph = screen.getAllByTestId("poll-graph-row").map((row) => row.textContent);
    const answers = screen.getAllByRole("button").map((b) => b.textContent);
    expect(graph[0]).toContain("Zeta");
    expect(graph[1]).toContain("Alpha");
    expect(graph[2]).toContain("Mid");
    expect(answers[0]).toContain("Zeta");
    expect(answers[1]).toContain("Alpha");
    expect(answers[2]).toContain("Mid");
  });

  it("re-orders cells with CSS order only, so the stacked layout lists the graph first", () => {
    show(poll(labels(3), [1, 1, 1]));
    const graph = screen.getAllByTestId("poll-graph-row");
    const cards = screen.getAllByRole("button").map((b) => b.parentElement as HTMLElement);
    graph.forEach((row, i) => {
      expect(row.style.getPropertyValue("--o")).toBe(String(i));
      expect(row.className).toContain("@2xl:order-none");
    });
    cards.forEach((card, i) => {
      expect(card.style.getPropertyValue("--o")).toBe(String(1000 + i));
      expect(card.className).toContain("@2xl:order-none");
      // divider only on the wide two-column layout
      expect(card.className).toContain("@2xl:border-l");
    });
  });

  it("allows long and unbroken text to wrap instead of truncating or overflowing", () => {
    const long = "supercalifragilisticexpialidocious".repeat(8);
    const sentence = "This is a very long answer sentence that keeps going ".repeat(6).trim();
    show(poll([long, sentence, "日本語のとても長い回答テキスト ✓ 100% #tag", "A1B2C3 / x_y-z"], [1, 2, 3, 0]));

    for (const text of [long, sentence]) {
      for (const el of screen.getAllByText(text)) {
        expect(el.className).toContain("[overflow-wrap:anywhere]");
      }
    }
    const root = screen.getByTestId("poll-bar-results");
    expect(root.innerHTML).not.toMatch(/truncate|line-clamp|text-ellipsis/);
    // grid columns can shrink (minmax(0, ...)) and cells have min-w-0
    expect(root.innerHTML).toContain("minmax(0,2fr)_minmax(0,3fr)");
    for (const row of screen.getAllByTestId("poll-graph-row")) expect(row.className).toContain("min-w-0");
    expect(screen.getAllByText("日本語のとても長い回答テキスト ✓ 100% #tag").length).toBeGreaterThanOrEqual(2);
  });

  it("lets up to 12 options grow the card without a nested scroller", () => {
    show(poll(labels(12), labels(12).map(() => 1)));
    const root = screen.getByTestId("poll-bar-results");
    expect(root.className).not.toContain("overflow-y-auto");
    expect(root.className).not.toContain("max-h-");
  });

  it("scrolls inside one shared container when the list is long, never hiding options", () => {
    show(poll(labels(20), labels(20).map(() => 1)));
    const root = screen.getByTestId("poll-bar-results");
    expect(root.className).toContain("overflow-y-auto");
    expect(root.className).toContain("max-h-");
    // the graph and the answers live in the same scroller, so they cannot drift apart
    expect(root.contains(screen.getAllByTestId("poll-graph-row")[19])).toBe(true);
    expect(root.contains(screen.getAllByRole("button")[19])).toBe(true);
  });
});

describe("PollBarResults data accuracy", () => {
  it("scales bars to the axis so heights are proportional to the vote counts", () => {
    show(poll(["A", "B", "C", "D"], [2, 4, 8, 0]));
    const widths = screen.getAllByTestId("poll-bar").map((b) => b.style.width);
    expect(widths).toEqual(["25%", "50%", "100%", "0%"]);
  });

  it("gives equal vote counts equal bars and keeps zero-vote options visible", () => {
    show(poll(["A", "B", "C"], [3, 3, 0]));
    const bars = screen.getAllByTestId("poll-bar");
    expect(bars[0].style.width).toBe(bars[1].style.width);
    expect(bars[2].style.width).toBe("0%");
    expect(screen.getAllByTestId("poll-graph-row")[2].textContent).toContain("0");
    expect(screen.getAllByRole("button")[2].textContent).toContain("0%");
  });

  it("shows the whole-vote axis and percent / count per option", () => {
    show(poll(["A", "B"], [3, 1]));
    const axis = within(screen.getByTestId("poll-axis"));
    expect(axis.getAllByText(/^\d+$/).map((t) => t.textContent)).toEqual(["0", "1", "2", "3"]);
    const [a, b] = screen.getAllByRole("button");
    expect(a.textContent).toContain("75%");
    expect(a.textContent).toContain("3 votes");
    expect(b.textContent).toContain("25%");
    expect(b.textContent).toContain("1 vote");
  });

  it("renders an empty poll safely", () => {
    show(poll(["A", "B", "C"], [0, 0, 0]));
    expect(document.body.innerHTML).not.toContain("NaN");
    expect(screen.getAllByTestId("poll-bar").map((b) => b.style.width)).toEqual(["0%", "0%", "0%"]);
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("updates bars in place when new votes arrive, without re-keying the rows", () => {
    const view = show(poll(["A", "B"], [1, 1]));
    const before = screen.getAllByTestId("poll-graph-row");
    view.rerender(
      createElement(PollBarResults, { poll: poll(["A", "B"], [1, 3]), isVoting: false, onVote: vi.fn() })
    );
    const after = screen.getAllByTestId("poll-graph-row");
    expect(after[0]).toBe(before[0]); // same DOM nodes: no remount, so no replayed animation
    expect(after[1]).toBe(before[1]);
    // axis for a max of 3 votes is 0-3, so 1 vote is a third of the track
    expect(screen.getAllByTestId("poll-bar").map((b) => b.style.width)).toEqual([`${(1 / 3) * 100}%`, "100%"]);
    expect(screen.getAllByRole("button")[1].textContent).toContain("75%");
  });
});

describe("PollBarResults interaction and motion", () => {
  it("marks the viewer's choice and votes through the answer cards", async () => {
    const onVote = vi.fn();
    show(poll(["A", "B"], [2, 1], "o0"), onVote);
    const [a, b] = screen.getAllByRole("button");
    expect(a.getAttribute("aria-pressed")).toBe("true");
    expect(b.getAttribute("aria-pressed")).toBe("false");
    await userEvent.setup().click(b);
    expect(onVote).toHaveBeenCalledWith("o1");
  });

  it("animates bars up from zero on first render", () => {
    show(poll(["A", "B"], [2, 4]));
    const bars = screen.getAllByTestId("poll-bar");
    expect(bars.every((bar) => bar.getAttribute("data-initial") === "0%")).toBe(true);
    expect(Number(bars[0].getAttribute("data-duration"))).toBeGreaterThan(0);
  });

  it("respects prefers-reduced-motion: no zero-start and no animation duration", () => {
    motionState.reduced = true;
    show(poll(["A", "B"], [2, 4]));
    for (const bar of screen.getAllByTestId("poll-bar")) {
      expect(bar.getAttribute("data-initial")).toBe("none");
      expect(bar.getAttribute("data-duration")).toBe("0");
    }
  });
});

describe("scope: only multiple-choice BAR polls use the new layout", () => {
  const message = {
    id: "m1",
    content: "Q",
    type: "POLL",
    groupId: "g1",
    senderId: "u1",
    sender: { id: "u1", name: "Asha", email: null, role: "MENTOR", avatarUrl: null, status: "ONLINE" },
    attachmentUrl: null,
    attachmentName: null,
    isPinned: false,
    isEdited: false,
    isDeleted: false,
    createdAt: "2026-10-11T09:00:00.000Z",
    updatedAt: "2026-10-11T09:00:00.000Z",
  } as never;

  const renderMessage = (chartType: PollChartType) =>
    render(
      createElement(PollMessage, {
        message,
        poll: { ...poll(labels(3), [2, 1, 0]), chartType },
        groupId: "g1",
        isOwn: false,
        onVoted: vi.fn(),
        onDelete: vi.fn(),
      })
    );

  it("renders the two-section bar layout for BAR", () => {
    renderMessage(PollChartType.BAR);
    expect(screen.queryByTestId("poll-bar-results")).not.toBeNull();
    expect(document.querySelector(".aspect-square")).toBeNull();
  });

  it.each([PollChartType.DONUT, PollChartType.PIE])("leaves %s polls on the existing chart", (type) => {
    renderMessage(type);
    expect(screen.queryByTestId("poll-bar-results")).toBeNull();
    expect(screen.queryByTestId("poll-axis")).toBeNull();
    expect(document.querySelector(".aspect-square")).not.toBeNull();
  });
});
