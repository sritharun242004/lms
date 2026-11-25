/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobView } from "@/lib/skills/jobs/types";

const mocks = vi.hoisted(() => ({ patchJobSkill: vi.fn(), removeJobSkill: vi.fn(), patchJob: vi.fn(), toastError: vi.fn() }));
vi.mock("@/lib/skills/jobs/client", () => ({ patchJobSkill: mocks.patchJobSkill, removeJobSkill: mocks.removeJobSkill, patchJob: mocks.patchJob }));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: vi.fn() } }));

import { chatPhrase, slashCommand } from "./how-to-call";
import { FIXTURES, SUBS } from "./plugin-fixtures";
import { PluginOverview } from "./plugin-overview";

const ok = <T,>(data: T) => ({ ok: true as const, data });
const mount = (job: JobView = FIXTURES.draft) => {
  const props = { job, queueSave: vi.fn(), onSkillChange: vi.fn(), onSkillRemoved: vi.fn(), registerFileSaves: vi.fn(() => () => {}) };
  render(createElement(PluginOverview, props));
  return props;
};
const card = (name: RegExp | string) => screen.getByRole("article", { name });

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("how to call", () => {
  it("says the main skill runs everything and a sub-skill one part", () => {
    expect(chatPhrase("MAIN", "quarterly-deck")).toBe("use quarterly-deck for this");
    expect(chatPhrase("SUB", "deck-grammar-check")).toBe("use deck-grammar-check on this…");
    expect(slashCommand("acme-quarterly-deck", "deck-grammar-check")).toBe("/acme-quarterly-deck:deck-grammar-check");
  });
});

describe("PluginOverview", () => {
  it("puts the main skill on top and numbers the sub-skills in workflow order under it", () => {
    mount({ ...FIXTURES.draft, skills: [FIXTURES.draft.skills[0], SUBS[2], SUBS[0], SUBS[1]] });
    const articles = screen.getAllByRole("article").map((a) => a.getAttribute("aria-label"));
    expect(articles).toEqual(["Main skill quarterly-deck", "Sub-skill 1: deck-analyzer", "Sub-skill 2: deck-designer", "Sub-skill 3: deck-grammar-check"]);
    const list = screen.getByRole("list", { name: "Sub-skills, in workflow order" });
    expect(within(list).getAllByText("Use alone for just this part")).toHaveLength(3);
    expect(within(card("Main skill quarterly-deck")).getByText("Main — runs everything, using all sub-skills")).toBeTruthy();
  });

  it("shows how to call each skill, in chat and as a plugin command", () => {
    mount();
    const main = within(card("Main skill quarterly-deck"));
    expect(main.getByText("“use quarterly-deck for this”")).toBeTruthy();
    expect(main.getByText("/acme-quarterly-deck:quarterly-deck")).toBeTruthy();
    const sub = within(card(/deck-grammar-check$/));
    expect(sub.getByText("In Claude chat: say")).toBeTruthy();
    expect(sub.getByText("“use deck-grammar-check on this…”")).toBeTruthy();
    expect(sub.getByText("Claude Code / Cowork:")).toBeTruthy();
    expect(sub.getByText("/acme-quarterly-deck:deck-grammar-check")).toBeTruthy();
  });

  it("copies a command", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    mount();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy command: deck-designer" }));
    });
    expect(writeText).toHaveBeenCalledWith("/acme-quarterly-deck:deck-designer");
    expect(screen.getByText("Copied")).toBeTruthy();
  });

  it("moves a sub-skill down the workflow by swapping it with the next one", async () => {
    mocks.patchJobSkill.mockResolvedValue(ok({ ...SUBS[0], order: 2 }));
    const props = mount();
    expect((screen.getByRole("button", { name: "Move deck-analyzer up" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Move deck-grammar-check down" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Move deck-analyzer down" }));
    });
    expect(mocks.patchJobSkill).toHaveBeenCalledWith("j1", "s-1", { order: 2 });
    expect(props.onSkillChange).toHaveBeenCalledWith({ ...SUBS[0], order: 2 });
    expect(props.onSkillChange).toHaveBeenCalledWith({ ...SUBS[1], order: 1 });
  });

  it("keeps the order and says why when a move is refused", async () => {
    mocks.patchJobSkill.mockResolvedValue({ ok: false, code: "ALREADY_GENERATING", message: "The plugin is being written." });
    const props = mount();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Move deck-designer up" }));
    });
    expect(mocks.toastError).toHaveBeenCalledWith("The plugin is being written.");
    expect(props.onSkillChange).not.toHaveBeenCalled();
  });

  it("locks every skill while the plugin is written", () => {
    mount(FIXTURES.generating);
    for (const input of screen.getAllByLabelText(/^Skill name/)) expect((input as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Move deck-designer up" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
