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
    expect(saveAnswer).toHaveBeenCalledWith("q1", { answer: "draft" });
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
    expect(saveAnswer).toHaveBeenCalledWith("q1", { notRelevant: true });
  });

  it("reports a failed score", async () => {
    const score = vi.fn(() => Promise.resolve({ ok: false as const, code: "AI_FAILED", message: "x" }));
    const { result } = renderHook(() => useMatrixAnswers({ initialAnswers: [], initialRevision: 0, saveAnswer: vi.fn(() => ok({})), score }));
    act(() => result.current.scheduleScore());
    await tick(1500);
    expect(result.current.scoreState).toBe("failed");
  });
});
