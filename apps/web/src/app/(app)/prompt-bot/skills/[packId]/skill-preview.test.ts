/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SkillItemView } from "@/lib/skills/types";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { SkillPreview } from "./skill-preview";

const SKILL_MD = '---\nname: board-update\ndescription: "Writes the board update."\n---\n\n# Board update\n\nRead the notes first.\n';
const item = (over: Partial<SkillItemView> = {}): SkillItemView => ({
  id: "i1",
  order: 0,
  kind: "CUSTOM",
  name: "board-update",
  purpose: "Writes the board update.",
  status: "READY",
  files: [
    { path: "SKILL.md", content: SKILL_MD },
    { path: "references/context.md", content: "Context" },
    { path: "scripts/count.py", content: "print(1)" },
  ],
  validationErrors: [],
  scoreRevision: 0,
  answers: [],
  catalog: null,
  ...over,
});

type Call = { url: string; method: string; body: string | null };
let calls: Call[];
let route: (call: Call) => Response;
const ok = (data: unknown, status = 200) => new Response(JSON.stringify({ success: true, data }), { status, headers: { "content-type": "application/json" } });
const failFiles = () =>
  new Response(
    JSON.stringify({ success: false, error: { code: "VALIDATION_ERROR", message: "Fix these problems before saving the skill.", details: { files: ['"references/context.md": example problem'] } } }),
    { status: 400, headers: { "content-type": "application/json" } },
  );

const propsFor = (it: SkillItemView, extra: Record<string, unknown> = {}) => ({
  packId: "p1",
  item: it,
  readyCount: 1,
  onItemChange: vi.fn(),
  onRefine: vi.fn(),
  onDirtyChange: vi.fn(),
  ...extra,
});
const mount = (it: SkillItemView = item(), extra: Record<string, unknown> = {}) => {
  const props = propsFor(it, extra);
  const view = render(createElement(SkillPreview, props));
  return { props, ...view };
};
const save = () =>
  act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Save and check/ }));
    await vi.advanceTimersByTimeAsync(0);
  });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  calls = [];
  route = () => ok({});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const call = { url, method: init?.method ?? "GET", body: (init?.body as string) ?? null };
      calls.push(call);
      return route(call);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("SkillPreview", () => {
  it("renders SKILL.md first and lets the user switch to editing it", () => {
    mount();
    expect(screen.getByRole("heading", { name: "Board update" })).toBeTruthy();
    expect(screen.getByLabelText("Frontmatter").textContent).toContain("name: board-update");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect((screen.getByRole("textbox", { name: "Contents of SKILL.md" }) as HTMLTextAreaElement).value).toBe(SKILL_MD);
  });

  it("shows the script notice only for files in scripts/", () => {
    mount();
    expect(screen.queryByText(/Review scripts before running them/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "count.py" }));
    expect(screen.getByRole("note").textContent).toMatch(/Review scripts before running them/);
    fireEvent.click(screen.getByRole("button", { name: "context.md" }));
    expect(screen.queryByText(/Review scripts before running them/)).toBeNull();
  });

  it("saves every file, shows the server's per-file errors, and never offers Retry for a failed save", async () => {
    route = (call) => (call.url.endsWith("/files") ? failFiles() : ok({}));
    const { props } = mount();
    fireEvent.click(screen.getByRole("button", { name: "context.md" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Contents of references/context.md" }), { target: { value: "Edited" } });
    expect(props.onDirtyChange).toHaveBeenLastCalledWith(true);
    await save();
    const patch = calls.find((c) => c.method === "PATCH")!;
    expect(patch.url).toBe("/api/v1/prompt-bot/skill-packs/p1/items/i1/files");
    expect(JSON.parse(patch.body!).files).toEqual([
      { path: "SKILL.md", content: SKILL_MD },
      { path: "references/context.md", content: "Edited" },
      { path: "scripts/count.py", content: "print(1)" },
    ]);
    expect(screen.getByRole("alert").textContent).toContain("example problem");
    expect(screen.queryByRole("button", { name: /Retry generation/ })).toBeNull();
    expect((screen.getByRole("textbox", { name: "Contents of references/context.md" }) as HTMLTextAreaElement).value).toBe("Edited");
  });

  it("offers Retry generation only when generation failed, and not over unsaved edits", async () => {
    route = (call) => (call.url.endsWith("/generate") ? ok(item({ status: "GENERATING", files: null }), 202) : ok({}));
    const failed = item({ status: "FAILED", validationErrors: ["description is too long"] });
    const { props } = mount(failed);
    expect(screen.getByRole("alert").textContent).toContain("description is too long");
    fireEvent.click(screen.getByRole("button", { name: "context.md" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Contents of references/context.md" }), { target: { value: "Edited" } });
    expect((screen.getByRole("button", { name: /Retry generation/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: "Contents of references/context.md" }), { target: { value: "Context" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Retry generation/ }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(calls.find((c) => c.url.endsWith("/generate"))?.method).toBe("POST");
    expect(props.onItemChange).toHaveBeenCalledWith(expect.objectContaining({ status: "GENERATING" }));
  });

  it("shows the files when the pack poll delivers the finished skill, without polling itself", async () => {
    const { rerender } = mount(item({ status: "GENERATING", files: null }));
    expect(screen.getByRole("status").textContent).toMatch(/Writing your skill/);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(calls).toEqual([]);
    rerender(createElement(SkillPreview, propsFor(item())));
    expect(screen.getByRole("button", { name: "SKILL.md" })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("offers Refine and generate for a skill without files, and blocks downloads until one is ready", () => {
    const { props } = mount(item({ status: "DRAFT", files: null }), { readyCount: 0 });
    fireEvent.click(screen.getByRole("button", { name: /Refine and generate/ }));
    expect(props.onRefine).toHaveBeenCalled();
    expect((screen.getByRole("button", { name: /Download skill/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /Download pack/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
