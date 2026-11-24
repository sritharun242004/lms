import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), findMany: vi.fn(), create: vi.fn(), findUnique: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { skillCatalogEntry: { findMany: mocks.findMany, create: mocks.create, findUnique: mocks.findUnique, update: mocks.update } },
}));

import * as collection from "./route";
import * as entry from "./[id]/route";

const json = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/x", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = { params: Promise.resolve({ id: "scat_x" }) };
const ROW = {
  id: "scat_x",
  slug: "x-skill",
  name: "X skill",
  description: "Does x things very well.",
  sourceUrl: "https://github.com/a/b",
  license: "MIT",
  bundlable: true,
  installNotes: "",
  tags: [],
  isActive: true,
  createdById: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const NEW = { slug: "x-skill", name: "X skill", description: "Does x things very well.", sourceUrl: "https://github.com/a/b", license: "source-available" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findMany.mockResolvedValue([ROW]);
  mocks.create.mockResolvedValue(ROW);
  mocks.findUnique.mockResolvedValue(ROW);
  mocks.update.mockResolvedValue(ROW);
});

describe("skill catalog routes", () => {
  it("lets participants read active entries only, and not edit", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "p1", role: "MENTEE" });
    const res = await collection.GET();
    expect(res.status).toBe(200);
    expect(mocks.findMany).toHaveBeenCalledWith({ where: { isActive: true }, orderBy: { name: "asc" } });
    expect((await res.json()).data[0]).not.toHaveProperty("createdById");
    expect((await collection.POST(json("POST", NEW))).status).toBe(403);
    expect((await entry.PATCH(json("PATCH", { isActive: false }), ctx)).status).toBe(403);
  });

  it("shows coaches inactive entries too", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "c1", role: "MENTOR" });
    await collection.GET();
    expect(mocks.findMany).toHaveBeenCalledWith({ where: {}, orderBy: { name: "asc" } });
  });

  it("lets a coach add a link-only entry", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "c1", role: "MENTOR" });
    const res = await collection.POST(json("POST", NEW));
    expect(res.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith({
      data: { ...NEW, bundlable: false, installNotes: "", tags: [], isActive: true, createdById: "c1" },
    });
  });

  it("allows bundlable only for a permissive license", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "a1", role: "ADMIN" });
    const refused = await collection.POST(json("POST", { ...NEW, bundlable: true }));
    expect(refused.status).toBe(400);
    expect((await refused.json()).error.message).toMatch(/permissive/);
    expect((await collection.POST(json("POST", { ...NEW, license: "MIT", bundlable: true }))).status).toBe(201);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it("refuses a license change that would leave a non-permissive entry bundlable", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "a1", role: "ADMIN" });
    expect((await entry.PATCH(json("PATCH", { license: "source-available" }), ctx)).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("deactivates an entry", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "c1", role: "MENTOR" });
    expect((await entry.PATCH(json("PATCH", { isActive: false }), ctx)).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "scat_x" }, data: { isActive: false } });
  });

  it("reports a duplicate slug and an unknown entry", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "c1", role: "MENTOR" });
    mocks.create.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "P2002" }));
    expect((await collection.POST(json("POST", NEW))).status).toBe(400);
    mocks.findUnique.mockResolvedValueOnce(null);
    expect((await entry.PATCH(json("PATCH", { isActive: false }), ctx)).status).toBe(404);
  });

  it("rejects a non-https source and a non-kebab slug", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "c1", role: "MENTOR" });
    expect((await collection.POST(json("POST", { ...NEW, sourceUrl: "http://github.com/a/b" }))).status).toBe(400);
    expect((await collection.POST(json("POST", { ...NEW, slug: "X Skill" }))).status).toBe(400);
  });
});
