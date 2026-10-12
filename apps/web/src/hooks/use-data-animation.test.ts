/** @vitest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDataAnimation } from "./use-data-animation";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useDataAnimation", () => {
  it("animates on mount, then settles after the animation window", () => {
    const { result } = renderHook(() => useDataAnimation("a:1", 600));
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(749));
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(2));
    expect(result.current).toBe(false);
  });

  it("stays settled across re-renders that do not change the data (resize, selection)", () => {
    const { result, rerender } = renderHook(({ sig }) => useDataAnimation(sig, 600), { initialProps: { sig: "a:1" } });
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe(false);
    for (let i = 0; i < 5; i += 1) rerender({ sig: "a:1" });
    expect(result.current).toBe(false);
  });

  it("opens a new window, in the same render, when the data changes", () => {
    const { result, rerender } = renderHook(({ sig }) => useDataAnimation(sig, 600), { initialProps: { sig: "a:1" } });
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe(false);
    rerender({ sig: "a:2" });
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(800));
    expect(result.current).toBe(false);
  });

  it("extends the window when data keeps changing quickly", () => {
    const { result, rerender } = renderHook(({ sig }) => useDataAnimation(sig, 600), { initialProps: { sig: "a:1" } });
    act(() => vi.advanceTimersByTime(1000));
    rerender({ sig: "a:2" });
    act(() => vi.advanceTimersByTime(500));
    rerender({ sig: "a:3" });
    act(() => vi.advanceTimersByTime(500));
    expect(result.current).toBe(true); // 1000 ms after the first change, but only 500 after the latest
    act(() => vi.advanceTimersByTime(300));
    expect(result.current).toBe(false);
  });

  it("never animates when disabled (prefers-reduced-motion)", () => {
    const { result, rerender } = renderHook(({ sig }) => useDataAnimation(sig, 600, true), { initialProps: { sig: "a:1" } });
    expect(result.current).toBe(false);
    rerender({ sig: "a:2" });
    expect(result.current).toBe(false);
  });
});
