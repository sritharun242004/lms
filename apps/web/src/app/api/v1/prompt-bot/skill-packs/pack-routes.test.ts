import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { validateSkillFiles } from "@/lib/skills/format";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  isAiConfigured: vi.fn(),
  consumeAiUsage: vi.fn(),
  splitWork: vi.fn(),
  catalogFindMany: vi.fn(),
  packFindFirst: vi.fn(),
  packUpdate: vi.fn(),
  itemFindFirst: vi.fn(),
  itemCreate: vi.fn(),
  itemUpdate: vi.fn(),
  itemDelete: vi.fn(),
  loadPackView: vi.fn(),
  loadItemView: vi.fn(),
  createPackFromSplit: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/ai/config", async (orig) => ({ ...(await orig<typeof import("@/lib/ai/config")>()), isAiConfigured: mocks.isAiConfigured }));
vi.mock("@/lib/ai/usage", async (orig) => ({ ...(await orig<typeof import("@/lib/ai/usage")>()), consumeAiUsage: mocks.consumeAiUsage }));
vi.mock("@/lib/ai/claude", () => ({ splitWork: mocks.splitWork, scoreQuestions: vi.fn(), detectTaskKind: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    skillCatalogEntry: { findMany: mocks.catalogFindMany },
    skillPack: { findFirst: mocks.packFindFirst, update: mocks.packUpdate },
    skillPackItem: { findFirst: mocks.itemFindFirst, create: mocks.itemCreate, update: mocks.itemUpdate, delete: mocks.itemDelete },
  },
}));
vi.mock("@/lib/skills/packs", async (orig) => ({
  ...(await orig<typeof import("@/lib/skills/packs")>()),
  loadPackView: mocks.loadPackView,
  loadItemView: mocks.loadItemView,
  createPackFromSplit: mocks.createPackFromSplit,
}));

import * as collection from "./route";
import * as pack from "./[id]/route";
import * as items from "./[id]/items/route";
import * as item from "./[id]/items/[itemId]/route";

const json = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/x", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const packCtx = { params: Promise.resolve({ id: "p1" }) };
const itemCtx = { params: Promise.resolve({ id: "p1", itemId: "i1" }) };
const CATALOG = [{ id: "scat_impeccable", slug: "impeccable", name: "Impeccable", description: "UI polish." }];
const SKILL_MD = '---\nname: board-update\ndescription: "Writes the board update. Use for monthly reporting."\n---\n\nWrite it.\n';
const ownedItem = (over: Record<string, unknown> = {}) => ({
  id: "i1",
  kind: "CUSTOM",
  name: "board-update",
  status: "READY",
  generationStartedAt: null,
  files: [
    { path: "SKILL.md", content: SKILL_MD },
    { path: "references/context.md", content: "Context" },
  ],
  pack: { items: [{ id: "i1", name: "board-update", kind: "CUSTOM" }] },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTEE" });
  mocks.isAiConfigured.mockReturnValue(true);
  mocks.catalogFindMany.mockResolvedValue(CATALOG);
  mocks.loadItemView.mockResolvedValue({ id: "i1" });
});

describe("POST /skill-packs (split)", () => {
  it("splits with the active catalog, cleans the result and creates the pack", async () => {
    mocks.splitWork.mockResolvedValue({
      customSkills: [{ name: "Weekly Planner", purpose: "Plans my week." }, { name: "weekly planner", purpose: "Duplicate." }],
      catalogMatches: [{ slug: "impeccable", why: "UI polish." }, { slug: "ghost", why: "Not in the catalog." }],
    });
    mocks.createPackFromSplit.mockResolvedValue("p1");
    mocks.loadPackView.mockResolvedValue({ id: "p1" });

    const res = await collection.POST(json("POST", { description: "Plan my week\nand prep board updates", role: "  " }));

    expect(res.status).toBe(201);
    expect(mocks.consumeAiUsage).toHaveBeenCalledWith("u1", "skill_split");
    expect(mocks.splitWork).toHaveBeenCalledWith({ description: "Plan my week\nand prep board updates", role: null, catalog: CATALOG });
    expect(mocks.createPackFromSplit).toHaveBeenCalledWith({
      userId: "u1",
      title: "Plan my week",
      description: "Plan my week\nand prep board updates",
      role: null,
      split: {
        customSkills: [
          { name: "weekly-planner", purpose: "Plans my week." },
          { name: "weekly-planner-2", purpose: "Duplicate." },
        ],
        catalogMatches: [{ slug: "impeccable", why: "UI polish." }],
      },
      catalog: CATALOG,
    });
  });

  it("returns 503 without spending usage when the AI is not configured", async () => {
    mocks.isAiConfigured.mockReturnValue(false);
    const res = await collection.POST(json("POST", { description: "x" }));
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("AI_NOT_CONFIGURED");
    expect(mocks.consumeAiUsage).not.toHaveBeenCalled();
  });

  it("returns 429 at the daily split limit and creates nothing", async () => {
    const { LimitReachedError } = await import("@/lib/ai/usage");
    mocks.consumeAiUsage.mockRejectedValue(new LimitReachedError("skill_split", new Date("2026-11-25T00:00:00Z")));
    const res = await collection.POST(json("POST", { description: "x" }));
    expect(res.status).toBe(429);
    expect((await res.json()).error.code).toBe("LIMIT_REACHED");
    expect(mocks.createPackFromSplit).not.toHaveBeenCalled();
  });

  it("lets a non-limit usage failure surface instead of mapping it to AI_FAILED", async () => {
    mocks.consumeAiUsage.mockRejectedValue(new Error("database down"));
    await expect(collection.POST(json("POST", { description: "x" }))).rejects.toThrow("database down");
    expect(mocks.splitWork).not.toHaveBeenCalled();
  });

  it("rejects an empty description", async () => {
    expect((await collection.POST(json("POST", { description: "  " }))).status).toBe(400);
  });

  it("requires sign-in", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await collection.POST(json("POST", { description: "x" }))).status).toBe(401);
  });
});

describe("/skill-packs/:id", () => {
  it("returns 404 for someone else's pack", async () => {
    mocks.loadPackView.mockResolvedValue(null);
    expect((await pack.GET(json("GET"), packCtx)).status).toBe(404);
    expect(mocks.loadPackView).toHaveBeenCalledWith("p1", "u1");
  });

  it("does not rename someone else's pack", async () => {
    mocks.packFindFirst.mockResolvedValue(null);
    expect((await pack.PATCH(json("PATCH", { title: "Mine now" }), packCtx)).status).toBe(404);
    expect(mocks.packUpdate).not.toHaveBeenCalled();
  });
});

describe("POST /skill-packs/:id/items", () => {
  it("adds a custom skill with a name unique among the pack's custom skills", async () => {
    mocks.packFindFirst.mockResolvedValue({
      id: "p1",
      items: [
        { name: "board-update", kind: "CUSTOM", order: 0 },
        { name: "pptx", kind: "CATALOG", order: 1 },
      ],
    });
    mocks.itemCreate.mockResolvedValue({ id: "i2" });
    const res = await items.POST(json("POST", { name: "Board Update", purpose: "Writes the\nupdate." }), packCtx);
    expect(res.status).toBe(201);
    expect(mocks.itemCreate).toHaveBeenCalledWith({
      data: { packId: "p1", kind: "CUSTOM", order: 2, name: "board-update-2", purpose: "Writes the update." },
      select: { id: true },
    });
  });
});

describe("PATCH /skill-packs/:id/items/:itemId", () => {
  it("renames a ready skill and rewrites the SKILL.md name so the files stay valid", async () => {
    mocks.itemFindFirst.mockResolvedValue(ownedItem());
    const res = await item.PATCH(json("PATCH", { name: "Weekly Report" }), itemCtx);
    expect(res.status).toBe(200);
    const { data } = mocks.itemUpdate.mock.calls[0][0];
    expect(data.name).toBe("weekly-report");
    expect(data.files[0].content).toContain("\nname: weekly-report\n");
    expect(validateSkillFiles(data.files, "weekly-report")).toEqual([]);
  });

  it("suffixes a rename that matches a sibling's name", async () => {
    mocks.itemFindFirst.mockResolvedValue(
      ownedItem({ pack: { items: [{ id: "i1", name: "board-update", kind: "CUSTOM" }, { id: "i2", name: "weekly-report", kind: "CUSTOM" }] } }),
    );
    await item.PATCH(json("PATCH", { name: "Weekly report" }), itemCtx);
    expect(mocks.itemUpdate.mock.calls[0][0].data.name).toBe("weekly-report-2");
  });

  it("refuses to rename while the skill is being written", async () => {
    mocks.itemFindFirst.mockResolvedValue(ownedItem({ status: "GENERATING", generationStartedAt: new Date() }));
    const res = await item.PATCH(json("PATCH", { name: "Other" }), itemCtx);
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("ALREADY_GENERATING");
    expect(mocks.itemUpdate).not.toHaveBeenCalled();
  });

  it("refuses to rename a catalog recommendation", async () => {
    mocks.itemFindFirst.mockResolvedValue(ownedItem({ kind: "CATALOG", files: null }));
    expect((await item.PATCH(json("PATCH", { name: "Other" }), itemCtx)).status).toBe(400);
  });

  it("returns 404 for someone else's item, for PATCH and DELETE", async () => {
    mocks.itemFindFirst.mockResolvedValue(null);
    expect((await item.PATCH(json("PATCH", { purpose: "x" }), itemCtx)).status).toBe(404);
    expect((await item.DELETE(json("DELETE"), itemCtx)).status).toBe(404);
    expect(mocks.itemDelete).not.toHaveBeenCalled();
  });
});
