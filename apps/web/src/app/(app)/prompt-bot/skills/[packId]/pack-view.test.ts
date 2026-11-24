/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SkillItemView, SkillPackView } from "@/lib/skills/types";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { PackView } from "./pack-view";

const MATRIX = {
  id: "pbm_skill_definition",
  name: "Skill definition",
  questions: [
    { id: "pbq_skill_1", text: "When should this skill be used?", guidance: "Triggers", order: 0 },
    { id: "pbq_skill_2", text: "What context does it need to know?", guidance: "Background", order: 1 },
  ],
};
const custom = (over: Partial<SkillItemView> = {}): SkillItemView => ({
  id: "i1",
  order: 0,
  kind: "CUSTOM",
  name: "board-update",
  purpose: "Writes the board update.",
  status: "DRAFT",
  files: null,
  validationErrors: [],
  scoreRevision: 0,
  answers: [],
  catalog: null,
  ...over,
});
const SOURCE = "https://github.com/anthropics/skills/tree/main/skills/pptx";
const catalogItem: SkillItemView = {
  ...custom({ id: "i2", order: 1, kind: "CATALOG", name: "pptx", purpose: "Decks for the board." }),
  catalog: { id: "scat_pptx", slug: "pptx", name: "PowerPoint", sourceUrl: SOURCE, license: "source-available", bundlable: false, installNotes: "n" },
};
const PACK: SkillPackView = { id: "p1", title: "My week", description: "Weekly work.", role: null, matrix: MATRIX, items: [custom(), catalogItem] };

type Call = { url: string; method: string; body: string | null };
let calls: Call[];
let route: (call: Call) => Response;
const ok = (data: unknown, status = 200) => new Response(JSON.stringify({ success: true, data }), { status, headers: { "content-type": "application/json" } });
const tick = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
const steps = () => within(screen.getByRole("navigation", { name: "Steps" }));
const mount = (initial: SkillPackView = PACK, aiConfigured = true) => render(createElement(PackView, { initial, aiConfigured, isAdmin: false }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  calls = [];
  route = (call) => {
    if (call.url.endsWith("/score")) return ok({ applied: true, revision: 0, answers: [] });
    if (call.url.endsWith("/generate")) return ok(custom({ status: "GENERATING" }), 202);
    return ok({});
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

describe("PackView", () => {
  it("starts on the skills step with custom skills and existing skills (license and source link)", () => {
    mount();
    expect(screen.getByRole("heading", { level: 1, name: "My week" })).toBeTruthy();
    expect(steps().getByRole("button", { name: "Skills" }).getAttribute("aria-current")).toBe("step");
    expect(screen.getByRole("heading", { name: "Build custom" })).toBeTruthy();
    expect(screen.getByText("board-update")).toBeTruthy();
    expect(screen.getByText("Draft")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Use existing" })).toBeTruthy();
    expect(screen.getByText("PowerPoint")).toBeTruthy();
    expect(screen.getByText("Decks for the board.")).toBeTruthy();
    expect(screen.getByText("source-available")).toBeTruthy();
    expect(screen.getByRole("link", { name: /View source/ }).getAttribute("href")).toBe(SOURCE);
  });

  it("opens Refine with the skill-definition questions and bars, and scores a skill that was never scored", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Refine board-update" }));
    expect(steps().getByRole("button", { name: "Refine" }).getAttribute("aria-current")).toBe("step");
    expect(screen.getByRole("heading", { level: 2, name: "Skill definition" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^1\.\s*When should this skill be used\?/ })).toBeTruthy();
    expect(screen.getAllByRole("meter")).toHaveLength(2);
    expect((screen.getByRole("textbox", { name: "Purpose" }) as HTMLTextAreaElement).value).toBe("Writes the board update.");
    await tick(1500);
    expect(calls.some((c) => c.url === "/api/v1/prompt-bot/skill-packs/p1/items/i1/score" && c.method === "POST")).toBe(true);
  });

  it("opens Refine with the saved purpose and answers, not a stale cached first load (browser Back)", async () => {
    route = (call) =>
      call.url === "/api/v1/prompt-bot/skill-packs/p1/items/i1" && call.method === "GET"
        ? ok(
            custom({
              purpose: "Saved purpose",
              scoreRevision: 3,
              answers: [{ questionId: "pbq_skill_1", answer: "Every Monday", score: 2, reason: "Partly", notRelevant: false }],
            }),
          )
        : ok({});
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Refine board-update" }));
    await tick(0);
    expect((screen.getByRole("textbox", { name: "Purpose" }) as HTMLTextAreaElement).value).toBe("Saved purpose");
    expect((screen.getByRole("textbox", { name: "When should this skill be used?" }) as HTMLTextAreaElement).value).toBe("Every Monday");
  });

  it("warns about unanswered questions before generating, then shows the preview while the skill is written", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Refine board-update" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Generate skill/ }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("2 questions not answered yet"));
    expect(calls.find((c) => c.url.endsWith("/generate"))?.method).toBe("POST");
    expect(steps().getByRole("button", { name: "Preview and download" }).getAttribute("aria-current")).toBe("step");
    expect(screen.getByRole("status").textContent).toMatch(/Writing your skill/);
  });

  it("confirms before Generate again replaces a skill's files, and does nothing on cancel", async () => {
    const ready = custom({ status: "READY", files: [{ path: "SKILL.md", bytes: 1 }] });
    mount({ ...PACK, items: [ready, catalogItem] });
    fireEvent.click(screen.getByRole("button", { name: "Refine board-update" }));
    const generateAgain = () =>
      act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /Generate again/ }));
        await vi.advanceTimersByTimeAsync(0);
      });
    await generateAgain();
    expect(screen.getByRole("alertdialog").textContent).toContain("This replaces the current files, including your edits");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(calls.some((c) => c.url.endsWith("/generate"))).toBe(false);
    await generateAgain();
    await act(async () => {
      fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Generate again" }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(calls.find((c) => c.url.endsWith("/generate"))?.method).toBe("POST");
  });

  it("adds a custom skill to the list", async () => {
    route = (call) => (call.url.endsWith("/items") ? ok(custom({ id: "i3", order: 2, name: "weekly-plan", purpose: "Plans the week." }), 201) : ok({}));
    mount();
    fireEvent.change(screen.getByLabelText("Skill name"), { target: { value: "Weekly plan" } });
    fireEvent.change(screen.getByLabelText("What it does"), { target: { value: "Plans the week." } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Add skill/ }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(JSON.parse(calls.find((c) => c.url.endsWith("/items"))!.body!)).toEqual({ name: "Weekly plan", purpose: "Plans the week." });
    expect(screen.getByText("weekly-plan")).toBeTruthy();
  });

  it("disables Refine and Preview when there are no custom skills", () => {
    mount({ ...PACK, items: [catalogItem] });
    expect((steps().getByRole("button", { name: "Refine" }) as HTMLButtonElement).disabled).toBe(true);
    expect((steps().getByRole("button", { name: "Preview and download" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/No custom skills yet/)).toBeTruthy();
  });
});

describe("PackView without the AI configured (M8)", () => {
  const ready = custom({ status: "READY", files: [{ path: "SKILL.md", bytes: 1 }] });
  const pack: SkillPackView = { ...PACK, items: [ready, catalogItem] };

  it("still lists skills, but Refine says the AI is not configured and never scores", async () => {
    mount(pack, false);
    expect(screen.getByText("board-update")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Refine board-update" }));
    expect(screen.getByText("Prompt Bot isn't configured yet")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Generate/ })).toBeNull();
    await tick(5000);
    expect(calls.some((c) => c.url.endsWith("/score"))).toBe(false);
  });

  it("keeps the preview and downloads, and blocks Retry generation", async () => {
    route = (call) =>
      call.url.endsWith("/items/i1") ? ok({ ...custom({ status: "FAILED" }), files: [{ path: "SKILL.md", content: "x" }] }) : ok({});
    mount({ ...pack, items: [custom({ status: "FAILED", files: [{ path: "SKILL.md", bytes: 1 }] }), ready] }, false);
    fireEvent.click(steps().getByRole("button", { name: "Preview and download" }));
    await tick(0);
    expect((screen.getByRole("button", { name: /Download pack/ }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: /Retry generation/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/AI isn't configured/)).toBeTruthy();
  });
});

describe("PackView reorder (C11)", () => {
  const two: SkillPackView = {
    ...PACK,
    items: [custom(), custom({ id: "i3", order: 1, name: "weekly-plan", purpose: "Plans the week." }), { ...catalogItem, order: 2 }],
  };

  it("moves a custom skill down by swapping the two orders and persisting both", async () => {
    route = (call) => {
      const body = call.body ? JSON.parse(call.body) : {};
      const id = call.url.split("/items/")[1];
      return id ? ok(custom({ id, order: body.order, name: id === "i1" ? "board-update" : "weekly-plan" })) : ok({});
    };
    mount(two);
    const names = () => screen.getAllByText(/^(board-update|weekly-plan)$/).map((n) => n.textContent);
    expect(names()).toEqual(["board-update", "weekly-plan"]);
    expect((screen.getByRole("button", { name: "Move board-update up" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Move board-update down" }));
      await vi.advanceTimersByTimeAsync(0);
    });
    const patches = calls.filter((c) => c.method === "PATCH").map((c) => [c.url.split("/items/")[1], JSON.parse(c.body!)]);
    expect(patches).toEqual(expect.arrayContaining([["i1", { order: 1 }], ["i3", { order: 0 }]]));
    expect(names()).toEqual(["weekly-plan", "board-update"]);
  });
});

describe("PackView polling (C8)", () => {
  const generating: SkillPackView = { ...PACK, items: [custom({ status: "GENERATING" }), catalogItem] };

  it("polls the pack while a skill is being written, on any step, and updates the badge", async () => {
    route = (call) =>
      call.url === "/api/v1/prompt-bot/skill-packs/p1" ? ok({ ...PACK, items: [custom({ status: "READY", files: [{ path: "SKILL.md", bytes: 1 }] }), catalogItem] }) : ok({});
    mount(generating);
    expect(screen.getByText("Writing…")).toBeTruthy();
    await tick(3000);
    expect(calls.filter((c) => c.url === "/api/v1/prompt-bot/skill-packs/p1").length).toBe(1);
    expect(screen.getByText("Ready")).toBeTruthy();
    await tick(60_000);
    expect(calls.filter((c) => c.url === "/api/v1/prompt-bot/skill-packs/p1").length).toBe(1);
  });

  it("keeps polling past the stale window, so an interrupted skill turns retryable without a refresh", async () => {
    let interrupted = false;
    route = (call) =>
      call.url === "/api/v1/prompt-bot/skill-packs/p1"
        ? ok(interrupted ? { ...PACK, items: [custom({ status: "FAILED", validationErrors: ["Writing this skill was interrupted."] }), catalogItem] } : generating)
        : ok({});
    mount(generating);
    // The server reports the item interrupted once the stale window has passed since the claim.
    await tick(10 * 60_000 + 10_000);
    interrupted = true;
    await tick(45_000);
    expect(screen.getByText("Needs fixing")).toBeTruthy();
    expect(screen.queryByText(/Still working/)).toBeNull();
  });

  it("backs off, stops after the cap and says the skill is still being written", async () => {
    route = (call) => (call.url === "/api/v1/prompt-bot/skill-packs/p1" ? ok(generating) : ok({}));
    mount(generating);
    await tick(3000);
    await tick(4500);
    expect(calls.length).toBe(2);
    await tick(12 * 60_000);
    const polls = calls.length;
    expect(polls).toBeGreaterThan(5);
    expect(polls).toBeLessThan(60);
    expect(screen.getByText(/Still working/)).toBeTruthy();
    await tick(5 * 60_000);
    expect(calls.length).toBe(polls);
  });
});
