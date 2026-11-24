import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  isAiConfigured: vi.fn(),
  startGeneration: vi.fn(),
  runGeneration: vi.fn(),
  after: vi.fn(),
  findOwnedCustomItem: vi.fn(),
  loadItemView: vi.fn(),
  itemUpdate: vi.fn(),
}));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: mocks.after }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/ai/config", async (orig) => ({ ...(await orig<typeof import("@/lib/ai/config")>()), isAiConfigured: mocks.isAiConfigured }));
vi.mock("@/lib/ai/claude", () => ({ generateSkillDraft: vi.fn(), scoreQuestions: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { skillPackItem: { update: mocks.itemUpdate } } }));
vi.mock("@/lib/skills/packs", async (orig) => ({
  ...(await orig<typeof import("@/lib/skills/packs")>()),
  findOwnedCustomItem: mocks.findOwnedCustomItem,
  loadItemView: mocks.loadItemView,
}));
vi.mock("@/lib/skills/generate", async (orig) => ({
  ...(await orig<typeof import("@/lib/skills/generate")>()),
  startGeneration: mocks.startGeneration,
  runGeneration: mocks.runGeneration,
}));

import { AlreadyGeneratingError, SkillNotFoundError } from "@/lib/skills/generate";
import * as generate from "./[id]/items/[itemId]/generate/route";
import * as files from "./[id]/items/[itemId]/files/route";

const req = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/x", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = { params: Promise.resolve({ id: "p1", itemId: "i1" }) };
const SKILL_MD = '---\nname: board-update\ndescription: "Writes the board update. Use for monthly reporting."\n---\n\nWrite it.\n';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTEE" });
  mocks.isAiConfigured.mockReturnValue(true);
  mocks.findOwnedCustomItem.mockResolvedValue({ id: "i1", name: "board-update", status: "READY", generationStartedAt: null });
  mocks.loadItemView.mockResolvedValue({ id: "i1", status: "READY" });
});

describe("generate route", () => {
  it("claims the skill, answers 202 and writes it after the response", async () => {
    mocks.startGeneration.mockResolvedValue({ id: "i1", status: "GENERATING" });
    const res = await generate.POST(req("POST"), ctx);
    expect(res.status).toBe(202);
    expect((await res.json()).data.status).toBe("GENERATING");
    expect(mocks.startGeneration).toHaveBeenCalledWith("p1", "i1", "u1");
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(mocks.runGeneration).not.toHaveBeenCalled();
    await mocks.after.mock.calls[0][0]();
    expect(mocks.runGeneration).toHaveBeenCalledWith("p1", "i1", "u1");
  });

  it("maps not found, already generating, the daily limit and a missing key", async () => {
    const { LimitReachedError } = await import("@/lib/ai/usage");
    mocks.startGeneration.mockRejectedValueOnce(new SkillNotFoundError());
    expect((await generate.POST(req("POST"), ctx)).status).toBe(404);
    mocks.startGeneration.mockRejectedValueOnce(new AlreadyGeneratingError());
    const busy = await generate.POST(req("POST"), ctx);
    expect(busy.status).toBe(409);
    expect((await busy.json()).error.code).toBe("ALREADY_GENERATING");
    mocks.startGeneration.mockRejectedValueOnce(new LimitReachedError("skill_generate", new Date("2026-11-25T00:00:00Z")));
    expect((await generate.POST(req("POST"), ctx)).status).toBe(429);
    mocks.isAiConfigured.mockReturnValue(false);
    expect((await generate.POST(req("POST"), ctx)).status).toBe(503);
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("lets an unexpected failure (for example the database) surface instead of reporting AI_FAILED", async () => {
    mocks.startGeneration.mockRejectedValueOnce(new Error("database down"));
    await expect(generate.POST(req("POST"), ctx)).rejects.toThrow("database down");
  });
});

describe("files route", () => {
  it("saves valid edits as READY", async () => {
    const edited = [{ path: "SKILL.md", content: SKILL_MD }, { path: "references/context.md", content: "Edited" }];
    const res = await files.PATCH(req("PATCH", { files: edited }), ctx);
    expect(res.status).toBe(200);
    expect(mocks.itemUpdate).toHaveBeenCalledWith({ where: { id: "i1" }, data: { files: edited, status: "READY", validationErrors: [] } });
  });

  it("rejects invalid edits with readable errors and saves nothing", async () => {
    const res = await files.PATCH(req("PATCH", { files: [{ path: "SKILL.md", content: SKILL_MD }, { path: "../evil.sh", content: "x" }] }), ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details.files).toEqual([expect.stringMatching(/'\.\.'/)]);
    expect(mocks.itemUpdate).not.toHaveBeenCalled();
  });

  it("reports a file over the size limit per file as VALIDATION_ERROR details.files", async () => {
    const big = "x".repeat(200 * 1024 + 1);
    const res = await files.PATCH(req("PATCH", { files: [{ path: "SKILL.md", content: SKILL_MD }, { path: "references/big.md", content: big }] }), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error.details.files).toEqual([expect.stringContaining("references/big.md")]);
    expect(mocks.itemUpdate).not.toHaveBeenCalled();
  });

  it("maps a malformed body to per-file details too", async () => {
    const res = await files.PATCH(req("PATCH", { files: [{ path: "SKILL.md", content: 5 }] }), ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details.files).toEqual([expect.stringContaining("SKILL.md")]);
  });

  it("returns 404 for someone else's skill and 409 while it is being written", async () => {
    mocks.findOwnedCustomItem.mockResolvedValueOnce(null);
    expect((await files.PATCH(req("PATCH", { files: [] }), ctx)).status).toBe(404);
    mocks.findOwnedCustomItem.mockResolvedValueOnce({ id: "i1", name: "board-update", status: "GENERATING", generationStartedAt: new Date() });
    expect((await files.PATCH(req("PATCH", { files: [] }), ctx)).status).toBe(409);
  });
});
