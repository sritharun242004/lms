import { unzipSync } from "fflate";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), loadPackView: vi.fn(), loadItemDetail: vi.fn(), loadReadySkillFiles: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/skills/packs", () => ({
  loadPackView: mocks.loadPackView,
  loadItemDetail: mocks.loadItemDetail,
  loadReadySkillFiles: mocks.loadReadySkillFiles,
}));

import * as packDownload from "./[id]/download/route";
import * as itemDownload from "./[id]/items/[itemId]/download/route";

const get = () => new NextRequest("http://localhost/x");
const packCtx = { params: Promise.resolve({ id: "p1" }) };
const itemCtx = { params: Promise.resolve({ id: "p1", itemId: "i1" }) };
const FILES = [{ path: "SKILL.md", content: '---\nname: board-update\ndescription: "x"\n---\n\nBody\n' }];
const item = (over: { id: string; name: string; status: string; files?: null }) => ({
  kind: "CUSTOM",
  purpose: "Writes it.",
  files: FILES as { path: string; content: string }[] | null,
  ...over,
});
const PACK = { id: "p1", title: "My Week!", description: "Weekly work.", role: null, items: [item({ id: "i1", name: "board-update", status: "READY" })] };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTEE" });
  mocks.loadReadySkillFiles.mockResolvedValue([{ name: "board-update", purpose: "Writes it.", files: FILES }]);
});

describe("legacy pack download", () => {
  it("zips the ready custom skills, without recommended-skills.md", async () => {
    mocks.loadPackView.mockResolvedValue(PACK);
    const res = await packDownload.GET(get(), packCtx);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="my-week.zip"');
    expect(Object.keys(unzipSync(new Uint8Array(await res.arrayBuffer()))).sort()).toEqual([
      "my-week/README.md",
      "my-week/skills/board-update/SKILL.md",
      "my-week/upload-to-claude/board-update.zip",
    ]);
    expect(mocks.loadReadySkillFiles).toHaveBeenCalledWith("p1", "u1");
  });

  it("returns 409 DUPLICATE_NAME when two ready skills share a folder name", async () => {
    mocks.loadPackView.mockResolvedValue(PACK);
    mocks.loadReadySkillFiles.mockResolvedValue([
      { name: "board-update", purpose: "Writes it.", files: FILES },
      { name: "board-update", purpose: "Also writes it.", files: FILES },
    ]);
    const res = await packDownload.GET(get(), packCtx);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("DUPLICATE_NAME");
    expect(body.error.message).toContain("board-update");
  });

  it("returns 409 NOTHING_TO_DOWNLOAD when no skill is ready, and 404 for someone else's pack", async () => {
    mocks.loadPackView.mockResolvedValue(PACK);
    mocks.loadReadySkillFiles.mockResolvedValue([]);
    const res = await packDownload.GET(get(), packCtx);
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("NOTHING_TO_DOWNLOAD");
    mocks.loadPackView.mockResolvedValue(null);
    expect((await packDownload.GET(get(), packCtx)).status).toBe(404);
  });
});

describe("legacy single skill download", () => {
  it("returns an upload-ready zip with the folder at its root", async () => {
    mocks.loadItemDetail.mockResolvedValue(PACK.items[0]);
    const res = await itemDownload.GET(get(), itemCtx);
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="board-update.zip"');
    expect(Object.keys(unzipSync(new Uint8Array(await res.arrayBuffer())))).toEqual(["board-update/SKILL.md"]);
  });

  it("returns 409 when the stored files can't be read and 404 for anything the loader doesn't return", async () => {
    // loadItemDetail only returns the owner's finished custom skills; unreadable files come back as FAILED with no files.
    mocks.loadItemDetail.mockResolvedValueOnce(item({ id: "i3", name: "broken", status: "FAILED", files: null }));
    const res = await itemDownload.GET(get(), itemCtx);
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("NOTHING_TO_DOWNLOAD");
    mocks.loadItemDetail.mockResolvedValueOnce(null);
    expect((await itemDownload.GET(get(), itemCtx)).status).toBe(404);
  });
});
