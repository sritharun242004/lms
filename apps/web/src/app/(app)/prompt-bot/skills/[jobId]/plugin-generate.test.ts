/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobView } from "@/lib/skills/jobs/types";

const mocks = vi.hoisted(() => ({ generatePlugin: vi.fn(), toastError: vi.fn() }));
vi.mock("@/lib/skills/jobs/client", () => ({ generatePlugin: mocks.generatePlugin }));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));

import { FIXTURES, MAIN, pluginView, SUBS } from "./plugin-fixtures";
import { groupErrorsBySkill, PluginGenerate } from "./plugin-generate";

const ok = <T,>(data: T) => ({ ok: true as const, data });
const mount = (job: JobView = FIXTURES.draft, gaps = 0, aiConfigured = true) => {
  const props = { job, gaps, aiConfigured, settleSaves: vi.fn(async () => {}), onPluginChange: vi.fn() };
  render(createElement(PluginGenerate, props));
  return props;
};
const generate = () => screen.getByRole("button", { name: /^Generate plugin/ }) as HTMLButtonElement;
const press = () =>
  act(async () => {
    fireEvent.click(generate());
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("confirm", vi.fn(() => true));
  mocks.generatePlugin.mockResolvedValue(ok(pluginView({ status: "GENERATING" })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PluginGenerate", () => {
  it("sends waiting saves, then generates the whole plugin at once when every question is answered", async () => {
    const props = mount();
    expect(generate().textContent).toBe("Generate plugin");
    await press();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(props.settleSaves.mock.invocationCallOrder[0]).toBeLessThan(mocks.generatePlugin.mock.invocationCallOrder[0]);
    expect(mocks.generatePlugin).toHaveBeenCalledWith("j1");
    expect(props.onPluginChange).toHaveBeenCalledWith(pluginView({ status: "GENERATING" }));
  });

  it("asks once when questions are unanswered, and does nothing on cancel", async () => {
    mount(FIXTURES.draft, 2);
    await press();
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain("2 questions unanswered — the plugin will be more general. Generate anyway?");
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    });
    expect(mocks.generatePlugin).not.toHaveBeenCalled();
    await press();
    await act(async () => {
      fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Generate anyway" }));
    });
    expect(mocks.generatePlugin).toHaveBeenCalledTimes(1);
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("names the next version once one exists", () => {
    mount(FIXTURES.readyV2);
    expect(generate().textContent).toBe("Generate plugin v3");
  });

  it("says how many skills are being written and locks the button", () => {
    mount(FIXTURES.generating);
    expect(screen.getByRole("status").textContent).toContain("Writing 4 skills…");
    expect(generate().disabled).toBe(true);
  });

  it("needs two sub-skills and the AI", () => {
    mount({ ...FIXTURES.draft, skills: [MAIN, SUBS[0]] });
    expect(generate().disabled).toBe(true);
    expect(screen.getByText("Add at least 2 sub-skills to generate.")).toBeTruthy();
    cleanup();
    mount(FIXTURES.draft, 0, false);
    expect(generate().disabled).toBe(true);
  });

  it("lists a failed run's errors by skill and keeps the last version available", () => {
    mount({ ...FIXTURES.failed, plugin: { ...FIXTURES.failed.plugin, latestVersion: 1 } });
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Last attempt failed");
    expect(within(alert).getByText("deck-designer")).toBeTruthy();
    expect(within(alert).getByText("description is too long")).toBeTruthy();
    expect(within(alert).getByText("deck-grammar-check")).toBeTruthy();
    expect(alert.textContent).toContain("v1 is still available.");
  });

  it("shows the server's structure problems inline", async () => {
    mocks.generatePlugin.mockResolvedValue({ ok: false, code: "PLUGIN_INVALID", message: "Fix the plugin first.", details: { skills: ["Add at least 2 sub-skills."] } });
    const props = mount();
    await press();
    expect(within(screen.getByRole("alert")).getByText("Add at least 2 sub-skills.")).toBeTruthy();
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(props.onPluginChange).not.toHaveBeenCalled();
  });

  it("shows any other refusal as a toast", async () => {
    mocks.generatePlugin.mockResolvedValue({ ok: false, code: "LIMIT_REACHED", message: "You've reached today's limit." });
    mount();
    await press();
    expect(mocks.toastError).toHaveBeenCalledWith("You've reached today's limit.");
  });
});

describe("groupErrorsBySkill", () => {
  it("groups prefixed errors under their skill, and the rest under the plugin", () => {
    expect(groupErrorsBySkill(["deck-designer: a", "deck-designer: b", "plugin.json is invalid", "x: y"], ["deck-designer"])).toEqual([
      { skill: "deck-designer", errors: ["a", "b"] },
      { skill: null, errors: ["plugin.json is invalid", "x: y"] },
    ]);
  });
});
