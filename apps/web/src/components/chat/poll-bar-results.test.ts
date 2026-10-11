/** @vitest-environment jsdom */

import { cloneElement, createElement, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PollChartType } from "@cms/shared";
import type { PollData } from "@/lib/api/services/message-service";

const state = vi.hoisted(() => ({ reduced: false, containerRenders: 0 }));

vi.mock("motion/react", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  return {
    useReducedMotion: () => state.reduced,
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

// jsdom has no layout, so ResponsiveContainer would render nothing. Give it a
// fixed size and count renders to prove the chart is not redrawn needlessly.
vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({
      children,
      height,
      minHeight,
    }: {
      children: ReactElement;
      height?: number | string;
      minHeight?: number;
    }) => {
      state.containerRenders += 1;
      const resolved = typeof height === "number" ? height : (minHeight ?? 300);
      return cloneElement(children, { width: 640, height: resolved } as never);
    },
  };
});

import { PollBarResults } from "./poll-bar-results";
import { PollMessage } from "./poll-message";

beforeEach(() => {
  state.reduced = false;
  state.containerRenders = 0;
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
const cards = () => within(screen.getByTestId("poll-answer-list")).getAllByRole("button");
const chart = () => screen.getByTestId("poll-bar-chart");
const tickTexts = () =>
  [...chart().querySelectorAll(".recharts-xAxis .recharts-cartesian-axis-tick text")].map((t) =>
    [...t.querySelectorAll("tspan")].map((s) => s.textContent).join(" ")
  );

describe("two-section layout", () => {
  it("splits the card into a graph and an answer list with a divider", () => {
    show(poll(labels(3), [2, 1, 0]));
    const graph = screen.getByTestId("poll-bar-graph");
    const list = screen.getByTestId("poll-answer-list");
    expect(graph.parentElement!.className).toContain("@2xl:grid-cols-2");
    expect(list.className).toContain("@2xl:border-l");
    // both columns may shrink, so long text can never force horizontal overflow
    expect(graph.className).toContain("min-w-0");
    expect(list.className).toContain("min-w-0");
  });

  it("keeps the graph in view while a long list scrolls", () => {
    show(poll(labels(20), labels(20).map(() => 1)));
    expect(screen.getByTestId("poll-bar-graph").className).toContain("@2xl:sticky");
  });
});

describe("column chart", () => {
  it("draws one rounded column per option, including zero-vote options", () => {
    state.reduced = true; // Recharts mounts bar labels once its animation ends
    show(poll(["A", "B", "C", "D"], [4, 2, 0, 1]));
    expect(chart().querySelectorAll(".recharts-bar-rectangle")).toHaveLength(4);
    const counts = [...chart().querySelectorAll(".recharts-label-list text")].map((t) => t.textContent);
    expect(counts).toEqual(["4", "2", "0", "1"]);
  });

  it("shows a whole-vote axis with a Votes title and dashed horizontal grid lines", () => {
    show(poll(["A", "B"], [7, 3]));
    const yTicks = [...chart().querySelectorAll(".recharts-yAxis .recharts-cartesian-axis-tick text")].map(
      (t) => t.textContent
    );
    expect(yTicks).toEqual(["0", "2", "4", "6", "8"]);
    expect(chart().textContent).toContain("Votes");
    const grid = chart().querySelector(".recharts-cartesian-grid");
    expect(grid?.querySelectorAll("line[stroke-dasharray]").length).toBeGreaterThan(0);
    expect(grid?.querySelectorAll(".recharts-cartesian-grid-vertical line")).toHaveLength(0);
  });

  it("centres the full answer text under each bar for up to 8 options", () => {
    show(poll(["Data readiness and architecture", "Mindset", "Talent and skills"], [0, 1, 1]));
    const ticks = tickTexts();
    expect(ticks).toHaveLength(3);
    expect(ticks[1]).toBe("Mindset");
    expect(ticks[0].replace(/\s/g, "")).toBe("Datareadinessandarchitecture");
    for (const tick of chart().querySelectorAll(".recharts-xAxis .recharts-cartesian-axis-tick text")) {
      expect(tick.getAttribute("text-anchor")).toBe("middle");
    }
  });

  it("switches to numbered keys above 8 options so labels can never collide", () => {
    show(poll(labels(10), labels(10).map((_, i) => i)));
    expect(tickTexts()).toEqual(Array.from({ length: 10 }, (_, i) => String(i + 1)));
    const markers = screen.getAllByTestId("poll-answer-marker").map((m) => m.textContent);
    expect(markers).toEqual(Array.from({ length: 10 }, (_, i) => String(i + 1)));
  });

  it("wraps long and unbroken labels instead of truncating them", () => {
    const long = "supercalifragilistic".repeat(3);
    show(poll([long, "Short", "A rather long sentence that needs several lines to fit"], [1, 1, 1]));
    const ticks = tickTexts();
    expect(ticks[0].replace(/\s/g, "")).toBe(long);
    expect(ticks[2].replace(/\s/g, "")).toBe("Aratherlongsentencethatneedsseverallinestofit");
    expect(document.body.innerHTML).not.toMatch(/…|text-ellipsis|truncate/);
  });

  it("exposes the data to assistive technology", () => {
    show(poll(["Alpha", "Beta"], [3, 1]));
    expect(chart().getAttribute("role")).toBe("img");
    expect(chart().getAttribute("aria-label")).toContain("1. Alpha: 3");
    expect(chart().getAttribute("aria-label")).toContain("2. Beta: 1");
  });

  it("renders an empty poll safely", () => {
    show(poll(["A", "B", "C"], [0, 0, 0]));
    expect(document.body.innerHTML).not.toContain("NaN");
    expect(chart().querySelectorAll(".recharts-bar-rectangle")).toHaveLength(3);
    expect(cards()).toHaveLength(3);
  });
});

describe("narrow charts", () => {
  it("uses number keys instead of splitting words when a category is too narrow", () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        cb: ResizeObserverCallback;
        constructor(cb: ResizeObserverCallback) {
          this.cb = cb;
        }
        observe(el: Element) {
          this.cb([{ target: el, contentRect: { width: 300 } } as ResizeObserverEntry], this as never);
        }
        unobserve() {}
        disconnect() {}
      }
    );
    show(poll(["Data readiness and architecture", "Mindset and awareness", "Talent", "Other", "More"], [1, 2, 3, 0, 1]));
    expect(tickTexts()).toEqual(["1", "2", "3", "4", "5"]);
    expect(screen.getAllByTestId("poll-answer-marker").map((m) => m.textContent)).toEqual(["1", "2", "3", "4", "5"]);
    // full text is still available in the answer list
    expect(cards()[0].textContent).toContain("Data readiness and architecture");
  });
});

describe("answer list", () => {
  it.each([2, 5, 10, 15, 20, 30])("shows every answer for %i options", (n) => {
    show(poll(labels(n), labels(n).map((_, i) => i)));
    expect(cards()).toHaveLength(n);
    expect(screen.getAllByTestId("poll-answer-marker")).toHaveLength(n);
    for (const text of labels(n)) expect(within(screen.getByTestId("poll-answer-list")).getByText(text)).toBeTruthy();
  });

  it("shows a colour circle, percentage and vote count for each answer, in order", () => {
    show(poll(["Zeta", "Alpha", "Mid"], [1, 5, 2]));
    const [zeta, alpha, mid] = cards();
    expect(zeta.textContent).toContain("Zeta");
    expect(zeta.textContent).toContain("13%");
    expect(zeta.textContent).toContain("1 vote");
    expect(alpha.textContent).toContain("63%");
    expect(alpha.textContent).toContain("5 votes");
    expect(mid.textContent).toContain("25%");
    const colours = screen.getAllByTestId("poll-answer-marker").map((m) => (m as HTMLElement).style.backgroundColor);
    expect(colours).toEqual(["var(--chart-1)", "var(--chart-2)", "var(--chart-3)"]);
  });

  it("highlights the leading answer and marks the viewer's own choice", () => {
    show(poll(["A", "B", "C"], [1, 4, 2], "o2"));
    const [a, b, c] = cards();
    expect(b.getAttribute("data-leading")).toBe("true");
    expect(a.getAttribute("data-leading")).toBeNull();
    expect(c.getAttribute("aria-pressed")).toBe("true");
    expect(b.getAttribute("aria-pressed")).toBe("false");
  });

  it("does not highlight a leader when nobody has voted", () => {
    show(poll(["A", "B"], [0, 0]));
    expect(cards().every((card) => card.getAttribute("data-leading") === null)).toBe(true);
  });

  it("lets long text wrap inside its card without colliding with the numbers", () => {
    const long = "word ".repeat(40).trim();
    show(poll([long, "x".repeat(150), "日本語のとても長い回答テキスト ✓"], [2, 1, 0]));
    for (const text of screen.getAllByText((_, el) => el?.className?.toString().includes("[overflow-wrap:anywhere]") ?? false)) {
      expect(text.className).toContain("min-w-0");
    }
    expect(screen.getByTestId("poll-answer-list").innerHTML).not.toMatch(/truncate|line-clamp/);
    expect(cards()[1].textContent).toContain("x".repeat(150));
  });

  it("votes through the cards", async () => {
    const onVote = vi.fn();
    show(poll(["A", "B"], [2, 1]), onVote);
    await userEvent.setup().click(cards()[1]);
    expect(onVote).toHaveBeenCalledWith("o1");
  });
});

describe("scrolling", () => {
  it("lets up to 12 options grow the card with no nested scroller", () => {
    show(poll(labels(12), labels(12).map(() => 1)));
    const root = screen.getByTestId("poll-bar-results");
    expect(root.className).not.toContain("overflow-y-auto");
    expect(root.className).not.toContain("max-h-");
  });

  it("scrolls the chart and answers together inside one container beyond 12", () => {
    show(poll(labels(20), labels(20).map(() => 1)));
    const root = screen.getByTestId("poll-bar-results");
    expect(root.className).toContain("overflow-y-auto");
    expect(root.contains(screen.getByTestId("poll-bar-graph"))).toBe(true);
    expect(root.contains(cards()[19])).toBe(true);
  });
});

describe("data updates and motion", () => {
  it("does not redraw the chart for fresh-but-equal poll objects (the 4s refresh)", () => {
    const view = show(poll(["A", "B"], [2, 1]));
    const before = state.containerRenders;
    view.rerender(createElement(PollBarResults, { poll: poll(["A", "B"], [2, 1]), isVoting: false, onVote: vi.fn() }));
    expect(state.containerRenders).toBe(before);
  });

  it("updates bars, counts and percentages when new votes arrive", () => {
    state.reduced = true;
    const view = show(poll(["A", "B"], [1, 1]));
    const before = state.containerRenders;
    view.rerender(createElement(PollBarResults, { poll: poll(["A", "B"], [1, 3]), isVoting: false, onVote: vi.fn() }));
    expect(state.containerRenders).toBeGreaterThan(before);
    expect([...chart().querySelectorAll(".recharts-label-list text")].map((t) => t.textContent)).toEqual(["1", "3"]);
    expect(cards()[1].textContent).toContain("75%");
    expect(cards()[1].textContent).toContain("3 votes");
  });

  it("animates answer progress up from zero, and not at all with reduced motion", () => {
    show(poll(["A", "B"], [2, 4]));
    const progress = () => [...document.querySelectorAll("[data-initial]")] as HTMLElement[];
    expect(progress().every((el) => el.getAttribute("data-initial") === "0%")).toBe(true);
    cleanup();

    state.reduced = true;
    show(poll(["A", "B"], [2, 4]));
    for (const el of progress()) {
      expect(el.getAttribute("data-initial")).toBe("none");
      expect(el.getAttribute("data-duration")).toBe("0");
    }
    // with animation off the bars are drawn at their final size straight away
    expect(chart().querySelectorAll(".recharts-bar-rectangle path").length).toBe(2);
  });
});

describe("scope: only multiple-choice BAR polls use this view", () => {
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

  it("renders the bar results for BAR", () => {
    renderMessage(PollChartType.BAR);
    expect(screen.queryByTestId("poll-bar-results")).not.toBeNull();
    expect(document.querySelector(".aspect-square")).toBeNull();
  });

  it.each([PollChartType.DONUT, PollChartType.PIE])("leaves %s polls on the existing chart", (type) => {
    renderMessage(type);
    expect(screen.queryByTestId("poll-bar-results")).toBeNull();
    expect(screen.queryByTestId("poll-bar-chart")).toBeNull();
    expect(document.querySelector(".aspect-square")).not.toBeNull();
  });
});
