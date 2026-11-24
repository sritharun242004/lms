/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SkillFile, SkillItemView } from "@/lib/skills/types";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { SkillPreview } from "./skill-preview";

const SKILL_MD = '---\nname: board-update\ndescription: "Writes the board update."\n---\n\n# Board update\n\nRead the notes first.\n';
const CONTENTS: SkillFile[] = [
  { path: "SKILL.md", content: SKILL_MD },
  { path: "references/context.md", content: "Context" },
  { path: "scripts/count.py", content: "print(1)" },
];
const ITEM_URL = "/api/v1/prompt-bot/skill-packs/p1/items/i1";
/** The pack view carries paths and sizes only; the preview loads contents with GET /items/:itemId. */
const item = (over: Partial<SkillItemView> = {}): SkillItemView => ({
  id: "i1",
  order: 0,
  kind: "CUSTOM",
  name: "board-update",
  purpose: "Writes the board update.",
  status: "READY",
  files: CONTENTS.map((f) => ({ path: f.path, bytes: f.content.length })),
  validationErrors: [],
  scoreRevision: 0,
  answers: [],
  catalog: null,
  ...over,
});

type Call = { url: string; method: string; body: string | null };
let calls: Call[];
let route: (call: Call) => Response;
let detail: (call: Call) => Response | null;
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
const settle = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
const mount = async (it: SkillItemView = item(), extra: Record<string, unknown> = {}) => {
  const props = propsFor(it, extra);
  const view = render(createElement(SkillPreview, props));
  await settle();
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
  detail = (call) => (call.url === ITEM_URL && call.method === "GET" ? ok({ ...item(), files: CONTENTS }) : null);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const call = { url, method: init?.method ?? "GET", body: (init?.body as string) ?? null };
      calls.push(call);
      return detail(call) ?? route(call);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("SkillPreview", () => {
  it("loads the opened item's file contents, showing a loading state until they arrive", async () => {
    render(createElement(SkillPreview, propsFor(item())));
    expect(screen.getByRole("status").textContent).toMatch(/Loading the files/);
    await settle();
    expect(calls).toEqual([{ url: ITEM_URL, method: "GET", body: null }]);
    expect(screen.getByRole("heading", { name: "Board update" })).toBeTruthy();
  });

  it("says so when the contents could not be loaded, and loads again on request", async () => {
    let fail = true;
    detail = (call) =>
      call.url === ITEM_URL
        ? fail
          ? new Response(JSON.stringify({ success: false, error: { code: "INTERNAL_ERROR", message: "Server error" } }), { status: 500 })
          : ok({ ...item(), files: CONTENTS })
        : null;
    await mount();
    expect(screen.getByRole("alert").textContent).toMatch(/couldn.t load the files/i);
    fail = false;
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Load again/ }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole("heading", { name: "Board update" })).toBeTruthy();
  });

  it("renders SKILL.md first and lets the user switch to editing it", async () => {
    await mount();
    expect(screen.getByRole("heading", { name: "Board update" })).toBeTruthy();
    expect(screen.getByLabelText("Frontmatter").textContent).toContain("name: board-update");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect((screen.getByRole("textbox", { name: "Contents of SKILL.md" }) as HTMLTextAreaElement).value).toBe(SKILL_MD);
  });

  it("shows the script notice only for files in scripts/", async () => {
    await mount();
    expect(screen.queryByText(/Review scripts before running them/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "count.py" }));
    expect(screen.getByRole("note").textContent).toMatch(/Review scripts before running them/);
    fireEvent.click(screen.getByRole("button", { name: "context.md" }));
    expect(screen.queryByText(/Review scripts before running them/)).toBeNull();
  });

  it("keeps the saved edits on screen after a successful save, without loading them again", async () => {
    route = (call) => (call.url.endsWith("/files") ? ok(item()) : ok({}));
    const { props } = await mount();
    fireEvent.click(screen.getByRole("button", { name: "context.md" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Contents of references/context.md" }), { target: { value: "Edited" } });
    await save();
    expect(props.onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(props.onItemChange).toHaveBeenCalledWith(expect.objectContaining({ id: "i1", status: "READY" }));
    expect(calls.filter((c) => c.method === "GET")).toHaveLength(1);
    expect((screen.getByRole("textbox", { name: "Contents of references/context.md" }) as HTMLTextAreaElement).value).toBe("Edited");
  });

  it("saves every file, shows the server's per-file errors, and never offers Retry for a failed save", async () => {
    route = (call) => (call.url.endsWith("/files") ? failFiles() : ok({}));
    const { props } = await mount();
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
    const { props } = await mount(failed);
    expect(screen.getByRole("alert").textContent).toContain("description is too long");
    fireEvent.click(screen.getByRole("button", { name: "context.md" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Contents of references/context.md" }), { target: { value: "Edited" } });
    expect((screen.getByRole("button", { name: /Retry generation/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: "Contents of references/context.md" }), { target: { value: "Context" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Retry generation/ }));
      await vi.advanceTimersByTimeAsync(0);
    });
    // The item has files, so replacing them is confirmed first.
    expect(screen.getByRole("alertdialog").textContent).toContain("This replaces the current files, including your edits");
    expect(calls.some((c) => c.url.endsWith("/generate"))).toBe(false);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Generate again" }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(calls.find((c) => c.url.endsWith("/generate"))?.method).toBe("POST");
    expect(props.onItemChange).toHaveBeenCalledWith(expect.objectContaining({ status: "GENERATING" }));
  });

  it("retries a failed skill without files straight away (nothing to replace)", async () => {
    route = (call) => (call.url.endsWith("/generate") ? ok(item({ status: "GENERATING", files: null }), 202) : ok({}));
    await mount(item({ status: "FAILED", files: null, validationErrors: ["The AI couldn't finish writing this skill. Try again."] }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Retry generation/ }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(calls.find((c) => c.url.endsWith("/generate"))?.method).toBe("POST");
  });

  it("says a failed regeneration kept the previous files, and keeps downloads available", async () => {
    await mount(item({ status: "READY", validationErrors: ["SKILL.md: description cannot contain < or >"] }));
    const notice = screen.getByRole("status");
    expect(notice.textContent).toMatch(/previous files were kept/);
    expect(notice.textContent).toContain("description cannot contain < or >");
    expect((screen.getByRole("button", { name: /Download skill/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows the files when the pack poll delivers the finished skill, without polling itself", async () => {
    const { rerender } = await mount(item({ status: "GENERATING", files: null }));
    expect(screen.getByRole("status").textContent).toMatch(/Writing your skill/);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(calls).toEqual([]);
    rerender(createElement(SkillPreview, propsFor(item())));
    await settle();
    expect(calls.map((c) => c.url)).toEqual([ITEM_URL]);
    expect(screen.getByRole("button", { name: "SKILL.md" })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("offers Refine and generate for a skill without files, and blocks downloads until one is ready", async () => {
    const { props } = await mount(item({ status: "DRAFT", files: null }), { readyCount: 0 });
    fireEvent.click(screen.getByRole("button", { name: /Refine and generate/ }));
    expect(props.onRefine).toHaveBeenCalled();
    expect((screen.getByRole("button", { name: /Download skill/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /Download pack/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
