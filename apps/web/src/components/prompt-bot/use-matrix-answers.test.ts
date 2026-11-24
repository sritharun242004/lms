/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { useMatrixAnswers } from "./use-matrix-answers";

const ok = <T>(data: T) => Promise.resolve({ ok: true as const, data });
const tick = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});
afterEach(() => vi.useRealTimers());

describe("useMatrixAnswers", () => {
  it("saves through the caller's endpoint, then scores the current revision and takes only score and reason", async () => {
    const saveAnswer = vi.fn(() => ok({ saved: true }));
    const score = vi.fn(() =>
      ok({ applied: true, revision: 5, answers: [{ questionId: "q1", answer: "server", score: 2, reason: "Partly", notRelevant: false }] }),
    );
    const { result } = renderHook(() => useMatrixAnswers({ initialAnswers: [], initialRevision: 4, saveAnswer, score }));

    act(() => result.current.updateAnswer("q1", { answer: "draft" }));
    expect(result.current.answerFor("q1").answer).toBe("draft");
    await tick(600);
    expect(saveAnswer).toHaveBeenCalledWith("q1", { answer: "draft" }, {});
    await tick(1500);
    expect(score).toHaveBeenCalledWith(5);
    expect(result.current.answerFor("q1")).toEqual({ questionId: "q1", answer: "draft", score: 2, reason: "Partly", notRelevant: false });
  });

  it("sends a pending save at once on flushSaves", async () => {
    const saveAnswer = vi.fn(() => ok({ saved: true }));
    const { result } = renderHook(() =>
      useMatrixAnswers({ initialAnswers: [], initialRevision: 0, saveAnswer, score: vi.fn(() => ok({ applied: false, revision: 0, answers: [] })) }),
    );
    act(() => result.current.updateAnswer("q1", { notRelevant: true }));
    await act(async () => {
      await result.current.flushSaves();
    });
    expect(saveAnswer).toHaveBeenCalledWith("q1", { notRelevant: true }, {});
  });

  it("sends a pending save when the component unmounts (leaving the page inside the app)", async () => {
    const saveAnswer = vi.fn(() => ok({ saved: true }));
    const { result, unmount } = renderHook(() =>
      useMatrixAnswers({ initialAnswers: [], initialRevision: 0, saveAnswer, score: vi.fn(() => ok({ applied: false, revision: 0, answers: [] })) }),
    );
    act(() => result.current.updateAnswer("q1", { answer: "half-typed" }));
    expect(saveAnswer).not.toHaveBeenCalled();
    unmount();
    await tick(0);
    expect(saveAnswer).toHaveBeenCalledWith("q1", { answer: "half-typed" }, {});
  });

  it.each([
    ["pagehide", () => window.dispatchEvent(new Event("pagehide"))],
    [
      "visibilitychange to hidden",
      () => {
        vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
        document.dispatchEvent(new Event("visibilitychange"));
      },
    ],
  ])("sends a pending save at once, as a keepalive request, on %s", async (_name, hide) => {
    const saveAnswer = vi.fn(() => ok({ saved: true }));
    const { result } = renderHook(() =>
      useMatrixAnswers({ initialAnswers: [], initialRevision: 0, saveAnswer, score: vi.fn(() => ok({ applied: false, revision: 0, answers: [] })) }),
    );
    act(() => result.current.updateAnswer("q1", { answer: "half-typed" }));
    act(() => hide());
    await tick(0);
    expect(saveAnswer).toHaveBeenCalledTimes(1);
    expect(saveAnswer).toHaveBeenCalledWith("q1", { answer: "half-typed" }, { keepalive: true });
    await tick(600);
    expect(saveAnswer).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it("asks before the page unloads while a save is pending or in flight, and not otherwise", async () => {
    let release!: (r: { ok: true; data: unknown }) => void;
    const saveAnswer = vi.fn(() => new Promise<{ ok: true; data: unknown }>((r) => (release = r)));
    const { result } = renderHook(() =>
      useMatrixAnswers({ initialAnswers: [], initialRevision: 0, saveAnswer, score: vi.fn(() => ok({ applied: false, revision: 0, answers: [] })) }),
    );
    const unload = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(unload()).toBe(false);
    act(() => result.current.updateAnswer("q1", { answer: "x" }));
    expect(unload()).toBe(true);
    await tick(0);
    // The pending save was sent as a keepalive request so it survives if the user leaves anyway.
    expect(saveAnswer).toHaveBeenCalledWith("q1", { answer: "x" }, { keepalive: true });
    expect(unload()).toBe(true);
    await act(async () => {
      release({ ok: true, data: {} });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(unload()).toBe(false);
  });

  it("reports a failed score", async () => {
    const score = vi.fn(() => Promise.resolve({ ok: false as const, code: "AI_FAILED", message: "x" }));
    const { result } = renderHook(() => useMatrixAnswers({ initialAnswers: [], initialRevision: 0, saveAnswer: vi.fn(() => ok({})), score }));
    act(() => result.current.scheduleScore());
    await tick(1500);
    expect(result.current.scoreState).toBe("failed");
  });
});
