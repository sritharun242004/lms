/** @vitest-environment jsdom */
import * as React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionView } from "@/lib/prompt-bot/sessions";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { Workspace } from "./workspace";

type Call = { url: string; method: string; body: string | null };
let calls: Call[];
let route: (call: Call) => Response | Promise<Response>;
let enhancementList: { version: number; content: string; unansweredQuestionIds: string[]; createdAt: string }[];

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ success: true, data }), { status, headers: { "content-type": "application/json" } });
const sse = (...events: object[]) =>
  new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });

function makeView(overrides: Partial<SessionView> = {}): SessionView {
  return {
    id: "s1",
    title: "T",
    basePrompt: "Write an email",
    taskMatrixId: null,
    taskDetected: false,
    scoreRevision: 0,
    matrices: [
      {
        id: "m1",
        slug: "core",
        name: "Core",
        kind: "CORE",
        questions: [
          { id: "q1", text: "First question", guidance: "g1", order: 0 },
          { id: "q2", text: "Second question", guidance: "g2", order: 1 },
        ],
      },
    ],
    answers: [
      { questionId: "q1", answer: "", score: 0, reason: null, notRelevant: false },
      { questionId: "q2", answer: "", score: 0, reason: null, notRelevant: false },
    ],
    latestEnhancement: null,
    ...overrides,
  };
}

const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const mount = async (view = makeView()) => {
  render(React.createElement(Workspace, { initial: view, taskMatrices: [] }));
  await tick(0);
};
const answerBox = () => screen.getByRole("textbox", { name: "First question" }) as HTMLTextAreaElement;
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });
const clickEnhance = async () => {
  fireEvent.click(screen.getByRole("button", { name: /^Enhance/ }));
  await tick(10);
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  calls = [];
  enhancementList = [];
  route = (call) => {
    if (call.url.endsWith("/enhancements")) return json(enhancementList);
    if (call.url.includes("/answers/")) return json({ saved: true });
    if (call.url.endsWith("/score")) return json({ applied: true, revision: 0, answers: [] });
    if (call.url.endsWith("/enhance")) return sse({ type: "delta", text: "new text" }, { type: "done", version: 2 });
    return json({});
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const call = { url, method: init?.method ?? "GET", body: (init?.body as string) ?? null };
      calls.push(call);
      return route(call);
    }),
  );
  vi.stubGlobal("confirm", vi.fn(() => true));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Workspace", () => {
  it("flushes the pending answer save before the enhance request", async () => {
    await mount();
    type(answerBox(), "my answer");
    await clickEnhance();
    const put = calls.findIndex((c) => c.method === "PUT");
    const enhance = calls.findIndex((c) => c.url.endsWith("/enhance"));
    expect(put).toBeGreaterThan(-1);
    expect(enhance).toBeGreaterThan(put);
    expect(calls[put].body).toBe(JSON.stringify({ answer: "my answer" }));
  });

  it("discards a score response computed before a newer edit", async () => {
    let release!: (r: Response) => void;
    route = (call) => {
      if (call.url.endsWith("/score")) return new Promise<Response>((r) => (release = r));
      return json({ saved: true });
    };
    await mount();
    type(answerBox(), "hello");
    await tick(600); // save
    await tick(1500); // score fires and is held
    expect(calls.some((c) => c.url.endsWith("/score"))).toBe(true);
    type(answerBox(), "hello2");
    await act(async () => {
      release(json({ applied: true, revision: 1, answers: [{ questionId: "q1", answer: "", score: 3, reason: "stale", notRelevant: true }] }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(answerBox().value).toBe("hello2");
    expect(screen.queryByText("3/3")).toBeNull();
    expect(screen.queryByText("stale")).toBeNull();
  });

  it("applies only score and reason from an accepted score response", async () => {
    route = (call) => {
      if (call.url.endsWith("/score")) {
        return json({ applied: true, revision: 1, answers: [{ questionId: "q1", answer: "server", score: 3, reason: "good", notRelevant: true }] });
      }
      return json({ saved: true });
    };
    await mount();
    type(answerBox(), "local");
    await tick(600);
    await tick(1500);
    await tick(0);
    expect(answerBox().value).toBe("local");
    expect(screen.getByText("good")).toBeTruthy();
    expect(screen.getByText("3/3")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Mark not relevant: First question/ })).toBeTruthy();
  });

  it("serializes same-field saves so the latest text is sent last", async () => {
    const releases: ((r: Response) => void)[] = [];
    route = (call) => {
      if (call.method === "PUT") return new Promise<Response>((r) => releases.push(r));
      return json({});
    };
    await mount();
    type(answerBox(), "a");
    await tick(600);
    type(answerBox(), "ab");
    await tick(600);
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(1);
    await act(async () => {
      releases[0](json({ saved: true }));
      await vi.advanceTimersByTimeAsync(0);
    });
    const puts = calls.filter((c) => c.method === "PUT");
    expect(puts).toHaveLength(2);
    expect(puts[1].body).toBe(JSON.stringify({ answer: "ab" }));
  });

  it("keeps the last good content and version when re-enhance fails", async () => {
    await mount();
    await clickEnhance();
    expect(screen.getByText("new text")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Enhanced prompt · v2/ })).toBeTruthy();
    route = (call) =>
      call.url.endsWith("/enhance")
        ? new Response(JSON.stringify({ success: false, error: { code: "AI_FAILED", message: "Try again" } }), { status: 502, headers: { "content-type": "application/json" } })
        : json({});
    await clickEnhance();
    expect(screen.getByText("Try again")).toBeTruthy();
    expect(screen.getByText("new text")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Enhanced prompt · v2/ })).toBeTruthy();
  });

  it("lets the user switch between enhancement versions", async () => {
    enhancementList = [
      { version: 2, content: "second draft", unansweredQuestionIds: [], createdAt: "2026-11-24T10:00:00Z" },
      { version: 1, content: "first draft", unansweredQuestionIds: [], createdAt: "2026-11-24T09:00:00Z" },
    ];
    await mount(makeView({ latestEnhancement: { version: 2, content: "second draft", createdAt: "2026-11-24T10:00:00Z" } }));
    expect(screen.getByText("second draft")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Version"), { target: { value: "1" } });
    expect(screen.getByText("first draft")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Enhanced prompt · v1/ })).toBeTruthy();
  });

  it("adds a new version to the switcher and selects it after enhancing", async () => {
    enhancementList = [{ version: 1, content: "first draft", unansweredQuestionIds: [], createdAt: "2026-11-24T09:00:00Z" }];
    await mount(makeView({ latestEnhancement: { version: 1, content: "first draft", createdAt: "2026-11-24T09:00:00Z" } }));
    await clickEnhance();
    expect((screen.getByLabelText("Version") as HTMLSelectElement).value).toBe("2");
    expect(screen.getByText("new text")).toBeTruthy();
  });

  it("focuses the answer box when a question row is clicked, but not on mount", async () => {
    await mount();
    expect(document.activeElement).not.toBe(answerBox());
    fireEvent.click(screen.getByRole("button", { name: /^2\.\s*Second question/ }));
    await tick(0);
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Second question" }));
  });

  it("shows the privacy line", async () => {
    await mount();
    expect(screen.getByText(/stored in the LMS and sent to Anthropic/)).toBeTruthy();
  });
});
