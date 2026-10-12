/** @vitest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTweenedNumbers } from "./use-tweened-numbers";

const DURATION = 600;
const frames = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useTweenedNumbers", () => {
  it("grows from zero on mount and settles exactly on the targets", () => {
    const { result } = renderHook(() => useTweenedNumbers([4, 10], DURATION));
    expect(result.current.values).toEqual([0, 0]);
    expect(result.current.animating).toBe(true);
    frames(300);
    expect(result.current.values[0]).toBeGreaterThan(0);
    expect(result.current.values[0]).toBeLessThan(4);
    frames(400);
    expect(result.current.values).toEqual([4, 10]);
    expect(result.current.animating).toBe(false);
  });

  it("starts an interrupted transition from the value currently drawn, not the old target", () => {
    const { result, rerender } = renderHook(({ t }) => useTweenedNumbers(t, DURATION), { initialProps: { t: [0, 10] } });
    frames(1000); // settle at [0, 10]
    rerender({ t: [10, 10] }); // option 0 starts growing 0 -> 10
    frames(200);
    const mid = result.current.values[0];
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(10);

    // The user changes their answer mid-flight: option 0 should now head back to 0.
    rerender({ t: [0, 10] });
    // First frame after the interruption: must continue from `mid`, never jump to 10.
    frames(16);
    const next = result.current.values[0];
    expect(next).toBeLessThanOrEqual(mid + 0.0001);
    expect(next).toBeGreaterThan(mid - 3);
    // and never overshoots above where it was when interrupted
    for (let i = 0; i < 40; i += 1) {
      frames(16);
      expect(result.current.values[0]).toBeLessThanOrEqual(mid + 0.0001);
    }
    expect(result.current.values[0]).toBe(0);
  });

  it("cancels the obsolete animation so it can no longer write values", () => {
    const cancel = vi.spyOn(globalThis, "cancelAnimationFrame");
    const { rerender } = renderHook(({ t }) => useTweenedNumbers(t, DURATION), { initialProps: { t: [0] } });
    frames(1000);
    rerender({ t: [5] });
    frames(100);
    const before = cancel.mock.calls.length;
    rerender({ t: [9] });
    expect(cancel.mock.calls.length).toBeGreaterThan(before);
  });

  it("does not restart for re-renders with unchanged targets", () => {
    const { result, rerender } = renderHook(({ t }) => useTweenedNumbers(t, DURATION), { initialProps: { t: [3, 6] } });
    frames(1000);
    expect(result.current.animating).toBe(false);
    for (let i = 0; i < 5; i += 1) rerender({ t: [3, 6] }); // new array identity, same numbers
    expect(result.current.animating).toBe(false);
    expect(result.current.values).toEqual([3, 6]);
  });

  it("moves only the values that changed", () => {
    const { result, rerender } = renderHook(({ t }) => useTweenedNumbers(t, DURATION), { initialProps: { t: [3, 6, 2] } });
    frames(1000);
    rerender({ t: [3, 6, 5] });
    frames(150);
    expect(result.current.values[0]).toBe(3);
    expect(result.current.values[1]).toBe(6);
    expect(result.current.values[2]).toBeGreaterThan(2);
    expect(result.current.values[2]).toBeLessThan(5);
  });

  it("returns the targets immediately when disabled (prefers-reduced-motion)", () => {
    const { result, rerender } = renderHook(({ t }) => useTweenedNumbers(t, DURATION, true), { initialProps: { t: [4, 9] } });
    expect(result.current).toEqual({ values: [4, 9], animating: false });
    rerender({ t: [7, 9] });
    expect(result.current).toEqual({ values: [7, 9], animating: false });
  });
});

describe("useTweenedNumbers initial values", () => {
  it("can start a value at its final position while others grow in", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTweenedNumbers([4, 10], 600, false, [0, 10]));
    expect(result.current.values).toEqual([0, 10]);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current.values).toEqual([4, 10]);
  });
});
