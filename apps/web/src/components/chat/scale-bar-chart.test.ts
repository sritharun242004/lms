/** @vitest-environment jsdom */

import { createElement, useState } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ reduced: false, chartRenders: 0 }));
vi.mock("motion/react", () => ({ useReducedMotion: () => state.reduced }));
// The real tween, counted: the chart calls it exactly once per render.
vi.mock("@/hooks/use-tweened-numbers", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/use-tweened-numbers")>("@/hooks/use-tweened-numbers");
  return {
    useTweenedNumbers: (...args: Parameters<typeof actual.useTweenedNumbers>) => {
      state.chartRenders += 1;
      return actual.useTweenedNumbers(...args);
    },
  };
});

import { ScaleBarChart, SCALE_PLOT_HEIGHT } from "./scale-bar-chart";
import { formatScaleStat, scaleAccent, scaleBars } from "./scale-results";

describe("scaleAccent", () => {
  it("gives the first five statements blue, green, purple, orange and pink", () => {
    expect([0, 1, 2, 3, 4].map(scaleAccent)).toEqual([
      "var(--chart-1)",
      "var(--chart-2)",
      "var(--chart-4)",
      "var(--chart-7)",
      "var(--chart-5)",
    ]);
  });

  it("never repeats a colour within the 10 statements a scale can have", () => {
    expect(new Set(Array.from({ length: 10 }, (_, i) => scaleAccent(i))).size).toBe(10);
    expect(scaleAccent(10)).toBe(scaleAccent(0));
  });
});

describe("scaleBars", () => {
  const range = { min: 0, max: 5 };

  it("handles zero responses without dividing by zero", () => {
    const { bars, total, peak } = scaleBars(range, [0, 0, 0, 0, 0, 0], null);
    expect(total).toBe(0);
    expect(peak).toBe(0);
    expect(bars.map((bar) => bar.percent)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(bars.some((bar) => bar.highlighted)).toBe(false);
  });

  it("handles one response", () => {
    const { bars, total } = scaleBars(range, [0, 1, 0, 0, 0, 0], null);
    expect(total).toBe(1);
    expect(bars[1]).toEqual({ value: 1, count: 1, percent: 100, highlighted: true });
  });

  it("counts several respondents on the same value", () => {
    const { bars, total, peak } = scaleBars(range, [0, 0, 0, 4, 0, 0], null);
    expect(total).toBe(4);
    expect(peak).toBe(4);
    expect(bars[3].percent).toBe(100);
  });

  it("covers a distribution spread over every value, including min and max", () => {
    const { bars, total } = scaleBars(range, [1, 2, 3, 4, 5, 5], null);
    expect(total).toBe(20);
    expect(bars.map((bar) => bar.value)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(bars.map((bar) => bar.percent)).toEqual([5, 10, 15, 20, 25, 25]);
    expect(bars.map((bar) => bar.highlighted)).toEqual([false, false, false, false, true, true]);
  });

  it("highlights the viewer's own value in preference to the most chosen one", () => {
    const { bars } = scaleBars(range, [0, 1, 0, 0, 6, 0], 1);
    expect(bars.filter((bar) => bar.highlighted).map((bar) => bar.value)).toEqual([1]);
  });

  it("always draws the whole range when the distribution is missing, short or malformed", () => {
    expect(scaleBars(range, undefined, null).bars).toHaveLength(6);
    expect(scaleBars(range, [], null).total).toBe(0);
    const { bars, total } = scaleBars(range, [2, Number.NaN, -3] as number[], null);
    expect(bars.map((bar) => bar.count)).toEqual([2, 0, 0, 0, 0, 0]);
    expect(total).toBe(2);
  });

  it("respects a non-zero minimum", () => {
    expect(scaleBars({ min: 1, max: 3 }, [1, 0, 1], 3).bars.map((bar) => [bar.value, bar.highlighted])).toEqual([
      [1, false],
      [2, false],
      [3, true],
    ]);
  });
});

describe("formatScaleStat", () => {
  it("shows a dash for missing statistics and keeps 0 as a real value", () => {
    expect(formatScaleStat(null)).toBe("–");
    expect(formatScaleStat(undefined)).toBe("–");
    expect(formatScaleStat(0)).toBe("0");
    expect(formatScaleStat(2.67)).toBe("2.67");
  });
});

describe("ScaleBarChart", () => {
  const props = (distribution: number[], selected: number | null = null) => ({
    min: 0,
    max: 5,
    distribution,
    selected,
    accent: "var(--chart-2)",
    label: "I understand",
  });
  const mount = (distribution: number[], selected: number | null = null) =>
    render(createElement(ScaleBarChart, props(distribution, selected)));
  const heights = () => screen.getAllByTestId("scale-bar").map((bar) => parseFloat((bar as HTMLElement).style.height));
  const counts = () => screen.getAllByTestId("scale-bar-count").map((node) => node.textContent);
  const percents = () => screen.getAllByTestId("scale-bar-percent").map((node) => node.textContent);
  const animating = () => screen.getByTestId("scale-bar-chart").getAttribute("data-animating");
  const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

  beforeEach(() => {
    state.reduced = false;
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("draws one bar per value and grows them in from the baseline", () => {
    mount([0, 2, 0, 4, 0, 0]);
    expect(heights()).toEqual([2, 2, 2, 2, 2, 2]);
    expect(animating()).toBe("true");
    tick(300);
    expect(heights()[3]).toBeGreaterThan(2);
    expect(heights()[3]).toBeLessThan(SCALE_PLOT_HEIGHT);
    tick(700);
    expect(heights()).toEqual([2, SCALE_PLOT_HEIGHT / 2, 2, SCALE_PLOT_HEIGHT, 2, 2]);
    expect(animating()).toBe("false");
  });

  it("keeps values nobody chose on the baseline with a 0 label", () => {
    mount([0, 0, 0, 0, 0, 0]);
    tick(1000);
    expect(heights()).toEqual([2, 2, 2, 2, 2, 2]);
    expect(counts()).toEqual(["0", "0", "0", "0", "0", "0"]);
    expect(percents()).toEqual(["0%", "0%", "0%", "0%", "0%", "0%"]);
    expect(screen.getAllByTestId("scale-bar").some((bar) => bar.hasAttribute("data-highlighted"))).toBe(false);
  });

  it("shows the real count and percentage for the whole of an animation", () => {
    const view = mount([0, 1, 0, 0, 0, 0]);
    tick(1000);
    view.rerender(createElement(ScaleBarChart, props([0, 1, 3, 0, 0, 0])));
    for (let elapsed = 0; elapsed < 700; elapsed += 50) {
      expect(counts()).toEqual(["0", "1", "3", "0", "0", "0"]);
      expect(percents()).toEqual(["0%", "25%", "75%", "0%", "0%", "0%"]);
      tick(50);
    }
  });

  it("moves a changed answer down on the old value and up on the new one, monotonically", () => {
    const view = mount([0, 1, 0, 0, 0, 0], 1);
    tick(1000);
    expect(heights()).toEqual([2, SCALE_PLOT_HEIGHT, 2, 2, 2, 2]);

    // The same respondent moves from 1 to 4: one bar falls, one rises.
    view.rerender(createElement(ScaleBarChart, props([0, 0, 0, 0, 1, 0], 4)));
    let previous = heights();
    for (let elapsed = 0; elapsed < 700; elapsed += 16) {
      tick(16);
      const now = heights();
      expect(now[1]).toBeLessThanOrEqual(previous[1] + 0.001);
      expect(now[4]).toBeGreaterThanOrEqual(previous[4] - 0.001);
      expect([now[0], now[2], now[3], now[5]]).toEqual([2, 2, 2, 2]);
      previous = now;
    }
    expect(heights()).toEqual([2, 2, 2, 2, SCALE_PLOT_HEIGHT, 2]);
    expect(counts()).toEqual(["0", "0", "0", "0", "1", "0"]);
    const highlighted = screen.getAllByTestId("scale-bar").filter((bar) => bar.hasAttribute("data-highlighted"));
    expect(highlighted.map((bar) => bar.getAttribute("data-value"))).toEqual(["4"]);
  });

  it("continues an interrupted change from the bar's current height", () => {
    const view = mount([0, 4, 0, 0, 0, 4]);
    tick(1000);
    view.rerender(createElement(ScaleBarChart, props([0, 0, 0, 0, 0, 4])));
    tick(200);
    const mid = heights()[1];
    expect(mid).toBeGreaterThan(2);
    expect(mid).toBeLessThan(SCALE_PLOT_HEIGHT);

    // Rapid second change before the first has finished.
    view.rerender(createElement(ScaleBarChart, props([0, 4, 0, 0, 0, 4])));
    tick(16);
    expect(heights()[1]).toBeGreaterThanOrEqual(mid - 0.001);
    expect(heights()[1]).toBeLessThan(mid + 12);
    tick(1000);
    expect(heights()[1]).toBe(SCALE_PLOT_HEIGHT);
  });

  it("does not re-render or replay for fresh-but-equal data from a refresh", () => {
    function Parent() {
      const [, setRefresh] = useState(0);
      return createElement(
        "div",
        null,
        createElement("button", { onClick: () => setRefresh((n) => n + 1) }, "refresh"),
        createElement(ScaleBarChart, props([1, 0, 2, 0, 0, 0], 2))
      );
    }
    render(createElement(Parent));
    tick(1000);
    const settled = heights();
    state.chartRenders = 0;

    // Each click rebuilds `distribution` as a new array with the same counts.
    for (let i = 0; i < 5; i += 1) {
      act(() => screen.getByText("refresh").click());
      expect(animating()).toBe("false");
      expect(heights()).toEqual(settled);
    }
    tick(1000);
    expect(state.chartRenders).toBe(0);
    expect(heights()).toEqual(settled);
  });

  it("jumps straight to the final heights when reduced motion is requested", () => {
    state.reduced = true;
    const view = mount([0, 2, 0, 4, 0, 0]);
    expect(heights()).toEqual([2, SCALE_PLOT_HEIGHT / 2, 2, SCALE_PLOT_HEIGHT, 2, 2]);
    expect(animating()).toBe("false");
    view.rerender(createElement(ScaleBarChart, props([4, 2, 0, 0, 0, 0])));
    expect(heights()).toEqual([SCALE_PLOT_HEIGHT, SCALE_PLOT_HEIGHT / 2, 2, 2, 2, 2]);
  });

  it("describes the distribution for assistive tech", () => {
    mount([1, 0, 0, 0, 0, 1]);
    const label = screen.getByRole("img").getAttribute("aria-label")!;
    expect(label).toContain("2 responses");
    expect(label).toContain("0: 1 (50%)");
    expect(label).toContain("5: 1 (50%)");
  });
});
