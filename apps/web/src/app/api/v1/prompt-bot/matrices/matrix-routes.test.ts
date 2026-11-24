// apps/web/src/app/api/v1/prompt-bot/matrices/matrix-routes.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  findMany: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  deleteMatrix: vi.fn(),
  questionUpdate: vi.fn(),
  questionCreate: vi.fn(),
  questionUpdateMany: vi.fn(),
  transaction: vi.fn(),
  settingsUpsert: vi.fn(),
  settingsFind: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    promptMatrix: { findMany: mocks.findMany, findUnique: mocks.findUnique, create: mocks.create, update: mocks.update, delete: mocks.deleteMatrix },
    promptMatrixQuestion: { update: mocks.questionUpdate, create: mocks.questionCreate, updateMany: mocks.questionUpdateMany },
    aiSettings: { upsert: mocks.settingsUpsert, findUnique: mocks.settingsFind },
    $transaction: mocks.transaction,
  },
}));

import * as collection from "./route";
import * as item from "./[id]/route";
import * as settings from "../settings/route";

const json = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/x", { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findMany.mockResolvedValue([]);
  mocks.transaction.mockImplementation(async (ops: unknown[]) => ops);
  mocks.create.mockResolvedValue({ id: "m1" });
});

describe("matrix routes", () => {
  it("lets participants read but not edit", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "p1", role: "MENTEE" });
    expect((await collection.GET()).status).toBe(200);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true, kind: { not: "SKILL" } } }));
    expect((await collection.POST(json("POST", { name: "Sales", questions: [] }))).status).toBe(403);
  });

  it("lets coaches create a task matrix with questions", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "c1", role: "MENTOR" });
    const res = await collection.POST(
      json("POST", { name: "Sales email", description: "Outbound sales", questions: [{ text: "Who is the buyer?", guidance: "Role, company size and pain." }] }),
    );
    expect(res.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Sales email",
          slug: "sales-email",
          kind: "TASK",
          isBuiltIn: false,
          createdById: "c1",
          questions: { create: [{ order: 0, text: "Who is the buyer?", guidance: "Role, company size and pain.", element: null }] },
        }),
      }),
    );
  });

  it("never deactivates the core matrix or deletes a built-in", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "a1", role: "ADMIN" });
    mocks.findUnique.mockResolvedValue({ id: "pbm_core", slug: "core", isBuiltIn: true, kind: "CORE", questions: [] });
    expect((await item.PATCH(json("PATCH", { isActive: false }), ctx("pbm_core"))).status).toBe(400);
    expect((await item.DELETE(json("DELETE"), ctx("pbm_core"))).status).toBe(400);
  });

  it("deactivates questions removed from the edited list instead of deleting them", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "a1", role: "ADMIN" });
    mocks.findUnique.mockResolvedValue({ id: "pbm_image", slug: "image", isBuiltIn: true, kind: "TASK", questions: [{ id: "q1" }, { id: "q2" }] });
    await item.PATCH(json("PATCH", { questions: [{ id: "q1", text: "Why?", guidance: "Purpose of the image." }] }), ctx("pbm_image"));
    expect(mocks.questionUpdateMany).toHaveBeenCalledWith({ where: { matrixId: "pbm_image", id: { in: ["q2"] } }, data: { isActive: false } });
  });

  it("lets only admins change limits, storing normalised values", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "c1", role: "MENTOR" });
    expect((await settings.PATCH(json("PATCH", { enhance: 50 }))).status).toBe(403);
    mocks.getCurrentUser.mockResolvedValue({ id: "a1", role: "ADMIN" });
    mocks.settingsFind.mockResolvedValue({ limits: { score: 300 } });
    const res = await settings.PATCH(json("PATCH", { enhance: 50 }));
    expect(res.status).toBe(200);
    expect(mocks.settingsUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { limits: expect.objectContaining({ enhance: 50, score: 300 }) } }),
    );
  });

  it("suffixes the slug when the name is already taken", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "c1", role: "MENTOR" });
    mocks.create.mockRejectedValueOnce(Object.assign(new Error("unique"), { code: "P2002" })).mockResolvedValueOnce({ id: "m2" });
    const res = await collection.POST(json("POST", { name: "Image", questions: [] }));
    expect(res.status).toBe(201);
    expect(mocks.create.mock.calls[1][0].data.slug).toMatch(/^image-[a-z0-9]+$/);
  });
});
