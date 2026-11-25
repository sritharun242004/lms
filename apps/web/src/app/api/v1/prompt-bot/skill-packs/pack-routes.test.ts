import { existsSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), loadPackView: vi.fn(), loadItemDetail: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/skills/packs", () => ({ loadPackView: mocks.loadPackView, loadItemDetail: mocks.loadItemDetail }));

import * as pack from "./[id]/route";
import * as item from "./[id]/items/[itemId]/route";

const get = () => new NextRequest("http://localhost/x");
const packCtx = { params: Promise.resolve({ id: "p1" }) };
const itemCtx = { params: Promise.resolve({ id: "p1", itemId: "i1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTEE" });
});

describe("legacy pack routes", () => {
  it("GET returns the owner's pack and 404 for anyone else's", async () => {
    mocks.loadPackView.mockResolvedValueOnce({ id: "p1", title: "My week", items: [] });
    const res = await pack.GET(get(), packCtx);
    expect(res.status).toBe(200);
    expect((await res.json()).data.title).toBe("My week");
    expect(mocks.loadPackView).toHaveBeenCalledWith("p1", "u1");
    mocks.loadPackView.mockResolvedValueOnce(null);
    expect((await pack.GET(get(), packCtx)).status).toBe(404);
  });

  it("GET item returns its files and 404 for anyone else's", async () => {
    mocks.loadItemDetail.mockResolvedValueOnce({ id: "i1", files: [{ path: "SKILL.md", content: "x" }] });
    const res = await item.GET(get(), itemCtx);
    expect((await res.json()).data.files).toEqual([{ path: "SKILL.md", content: "x" }]);
    expect(mocks.loadItemDetail).toHaveBeenCalledWith("p1", "i1", "u1");
    mocks.loadItemDetail.mockResolvedValueOnce(null);
    expect((await item.GET(get(), itemCtx)).status).toBe(404);
  });

  it("requires sign-in", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await pack.GET(get(), packCtx)).status).toBe(401);
    expect((await item.GET(get(), itemCtx)).status).toBe(401);
  });

  it("is read-only: no write handlers remain", () => {
    expect(Object.keys(pack)).toEqual(["GET"]);
    expect(Object.keys(item)).toEqual(["GET"]);
    for (const removed of [
      "route.ts",
      "[id]/items/route.ts",
      "[id]/items/[itemId]/answers/[questionId]/route.ts",
      "[id]/items/[itemId]/score/route.ts",
      "[id]/items/[itemId]/generate/route.ts",
      "[id]/items/[itemId]/files/route.ts",
    ]) {
      expect(existsSync(path.join(__dirname, removed)), removed).toBe(false);
    }
    expect(existsSync(path.join(__dirname, "../skill-catalog"))).toBe(false);
  });
});
