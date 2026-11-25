/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SkillPackView } from "@/lib/skills/types";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  loadPackView: vi.fn(),
  redirect: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  getItem: vi.fn(),
  downloadZip: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/skills/packs", () => ({ loadPackView: mocks.loadPackView }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));
vi.mock("@/lib/skills/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/skills/client")>()),
  getItem: mocks.getItem,
  downloadZip: mocks.downloadZip,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
afterEach(cleanup);

import LegacyPackPage from "./page";
import { LegacyPackView } from "./legacy-pack-view";

const SKILL_MD = '---\nname: board-update\ndescription: "Writes it."\n---\n\n# Board update\n\nRead the notes.\n';
const PACK = {
  id: "p1",
  title: "Board pack",
  description: "Every month I write the board update.",
  role: null,
  matrix: { id: "m", name: "Skill definition", questions: [] },
  items: [
    { id: "i1", order: 0, kind: "CUSTOM", name: "board-update", purpose: "Writes the board update.", status: "READY", files: [{ path: "SKILL.md", bytes: 80 }], validationErrors: [], scoreRevision: 0, answers: [] },
    { id: "i2", order: 1, kind: "CUSTOM", name: "never-written", purpose: "Draft only.", status: "DRAFT", files: null, validationErrors: [], scoreRevision: 0, answers: [] },
  ],
} as unknown as SkillPackView;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTEE" });
  mocks.getItem.mockResolvedValue({ ok: true, data: { ...PACK.items[0], files: [{ path: "SKILL.md", content: SKILL_MD }] } });
  mocks.downloadZip.mockResolvedValue({ ok: true });
});

describe("legacy pack page", () => {
  it("is 404 for a pack that is not the user's", async () => {
    mocks.loadPackView.mockResolvedValue(null);
    await expect(LegacyPackPage({ params: Promise.resolve({ packId: "p9" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.loadPackView).toHaveBeenCalledWith("p9", "u1");
  });

  it("renders the read-only view for the owner", async () => {
    mocks.loadPackView.mockResolvedValue(PACK);
    render(await LegacyPackPage({ params: Promise.resolve({ packId: "p1" }) }));
    await act(async () => {});
    expect(screen.getByRole("heading", { level: 1, name: "Board pack" })).toBeTruthy();
  });
});

describe("LegacyPackView", () => {
  const mount = async () => {
    render(createElement(LegacyPackView, { pack: PACK }));
    await act(async () => {});
  };

  it("shows only written skills, their files and the read-only note", async () => {
    await mount();
    expect(screen.getByText(/made with the earlier Skills Builder\. It can't be changed\./)).toBeTruthy();
    expect(screen.getByRole("button", { name: /board-update/ })).toBeTruthy();
    expect(screen.queryByText("never-written")).toBeNull();
    expect(mocks.getItem).toHaveBeenCalledWith("p1", "i1");
    expect(screen.getByRole("heading", { name: "Board update" })).toBeTruthy();
  });

  it("has no editing, generating or renaming controls", async () => {
    await mount();
    expect(screen.queryByRole("textbox")).toBeNull();
    for (const name of [/Generate/, /Save/, /Edit/, /Rename/, /Retry/, /Refine/]) expect(screen.queryByRole("button", { name })).toBeNull();
  });

  it("downloads one skill or the whole pack", async () => {
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Download for Claude" }));
    });
    expect(mocks.downloadZip).toHaveBeenCalledWith("/api/v1/prompt-bot/skill-packs/p1/items/i1/download");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Download pack" }));
    });
    expect(mocks.downloadZip).toHaveBeenCalledWith("/api/v1/prompt-bot/skill-packs/p1/download");
  });

  it("says when nothing in the pack was written", async () => {
    render(createElement(LegacyPackView, { pack: { ...PACK, items: [PACK.items[1]] } }));
    await act(async () => {});
    expect(screen.getByText("No skills in this pack were written, so there is nothing to show or download.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Download pack" })).toBeNull();
  });
});
