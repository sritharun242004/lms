import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  isAiConfigured: vi.fn(),
  suggestForJob: vi.fn(),
  addSkill: vi.fn(),
  updateSkill: vi.fn(),
  deleteSkill: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/ai/config", async (orig) => ({ ...(await orig<typeof import("@/lib/ai/config")>()), isAiConfigured: mocks.isAiConfigured }));
vi.mock("@/lib/ai/claude", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/skills/jobs/skills", async (orig) => ({
  ...(await orig<typeof import("@/lib/skills/jobs/skills")>()),
  suggestForJob: mocks.suggestForJob,
  addSkill: mocks.addSkill,
  updateSkill: mocks.updateSkill,
  deleteSkill: mocks.deleteSkill,
}));

import { AiResponseError } from "@/lib/ai/errors";
import { LimitReachedError } from "@/lib/ai/usage";
import {
  AlreadyGeneratingError,
  DuplicateNameError,
  EmptyDescriptionError,
  FilesAnalysingError,
  JobNotFoundError,
  SkillNotFoundError,
  TooManySkillsError,
} from "@/lib/skills/jobs/errors";
import * as skill from "./[id]/skills/[skillId]/route";
import * as skills from "./[id]/skills/route";
import * as suggest from "./[id]/suggest/route";

const req = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/x", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = { params: Promise.resolve({ id: "j1" }) };
const skillCtx = { params: Promise.resolve({ id: "j1", skillId: "s1" }) };
const error = async (res: Response) => ({ status: res.status, ...(await res.json()).error });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTEE" });
  mocks.isAiConfigured.mockReturnValue(true);
});

describe("POST /skill-jobs/[id]/suggest", () => {
  it("returns the job with its suggested skills", async () => {
    mocks.suggestForJob.mockResolvedValue({ id: "j1", skills: [{ name: "board-deck" }] });
    const res = await suggest.POST(req("POST"), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).data.skills).toEqual([{ name: "board-deck" }]);
    expect(mocks.suggestForJob).toHaveBeenCalledWith("j1", "u1");
  });

  it("maps every refusal", async () => {
    mocks.isAiConfigured.mockReturnValueOnce(false);
    expect((await suggest.POST(req("POST"), ctx)).status).toBe(503);
    expect(mocks.suggestForJob).not.toHaveBeenCalled();
    const cases: [Error, number, string][] = [
      [new JobNotFoundError(), 404, "NOT_FOUND"],
      [new EmptyDescriptionError(), 400, "VALIDATION_ERROR"],
      [new FilesAnalysingError(), 409, "FILES_ANALYSING"],
      [new AlreadyGeneratingError(), 409, "ALREADY_GENERATING"],
      [new TooManySkillsError(), 409, "TOO_MANY_SKILLS"],
      [new LimitReachedError("skill_split", new Date("2026-11-26T00:00:00Z")), 429, "LIMIT_REACHED"],
      [new AiResponseError("bad"), 502, "AI_FAILED"],
    ];
    for (const [thrown, status, code] of cases) {
      mocks.suggestForJob.mockRejectedValueOnce(thrown);
      expect(await error(await suggest.POST(req("POST"), ctx))).toMatchObject({ status, code });
    }
  });
});

describe("POST /skill-jobs/[id]/skills", () => {
  it("adds a skill and answers 201", async () => {
    mocks.addSkill.mockResolvedValue({ id: "s9", name: "new-skill" });
    const res = await skills.POST(req("POST", { name: "New skill", purpose: "Does it.", fileIds: ["f1"] }), ctx);
    expect(res.status).toBe(201);
    expect(mocks.addSkill).toHaveBeenCalledWith("j1", "u1", { name: "New skill", purpose: "Does it.", fileIds: ["f1"] });
  });

  it("validates the body and maps duplicates, a full job and ownership", async () => {
    expect((await skills.POST(req("POST", { name: "", purpose: "p" }), ctx)).status).toBe(400);
    expect((await skills.POST(req("POST", { name: "n", purpose: "p".repeat(301) }), ctx)).status).toBe(400);
    expect((await skills.POST(req("POST", { name: "n", purpose: "p", fileIds: Array.from({ length: 11 }, (_, i) => `f${i}`) }), ctx)).status).toBe(400);
    mocks.addSkill.mockRejectedValueOnce(new DuplicateNameError("board-deck"));
    expect(await error(await skills.POST(req("POST", { name: "Board deck", purpose: "p" }), ctx))).toMatchObject({ status: 409, code: "DUPLICATE_NAME" });
    mocks.addSkill.mockRejectedValueOnce(new TooManySkillsError());
    expect((await skills.POST(req("POST", { name: "x", purpose: "p" }), ctx)).status).toBe(409);
    mocks.addSkill.mockRejectedValueOnce(new JobNotFoundError());
    expect((await skills.POST(req("POST", { name: "x", purpose: "p" }), ctx)).status).toBe(404);
    mocks.getCurrentUser.mockResolvedValueOnce(null);
    expect((await skills.POST(req("POST", { name: "x", purpose: "p" }), ctx)).status).toBe(401);
  });
});

describe("/skill-jobs/[id]/skills/[skillId]", () => {
  it("patches a skill", async () => {
    mocks.updateSkill.mockResolvedValue({ id: "s1", name: "monthly-deck" });
    const res = await skill.PATCH(req("PATCH", { name: "Monthly deck", order: 2 }), skillCtx);
    expect((await res.json()).data.name).toBe("monthly-deck");
    expect(mocks.updateSkill).toHaveBeenCalledWith("j1", "s1", "u1", { name: "Monthly deck", order: 2 });
  });

  it("validates and maps the patch refusals", async () => {
    expect((await skill.PATCH(req("PATCH", {}), skillCtx)).status).toBe(400);
    expect((await skill.PATCH(req("PATCH", { order: -1 }), skillCtx)).status).toBe(400);
    mocks.updateSkill.mockRejectedValueOnce(new AlreadyGeneratingError());
    expect(await error(await skill.PATCH(req("PATCH", { name: "x" }), skillCtx))).toMatchObject({ status: 409, code: "ALREADY_GENERATING" });
    mocks.updateSkill.mockRejectedValueOnce(new DuplicateNameError("x"));
    expect(await error(await skill.PATCH(req("PATCH", { name: "x" }), skillCtx))).toMatchObject({ status: 409, code: "DUPLICATE_NAME" });
    mocks.updateSkill.mockRejectedValueOnce(new SkillNotFoundError());
    expect(await error(await skill.PATCH(req("PATCH", { purpose: "p" }), skillCtx))).toMatchObject({ status: 404, message: "Skill not found" });
  });

  it("deletes a skill and maps its refusals", async () => {
    expect((await (await skill.DELETE(req("DELETE"), skillCtx)).json()).data).toEqual({ deleted: true });
    expect(mocks.deleteSkill).toHaveBeenCalledWith("j1", "s1", "u1");
    mocks.deleteSkill.mockRejectedValueOnce(new AlreadyGeneratingError());
    expect((await skill.DELETE(req("DELETE"), skillCtx)).status).toBe(409);
    mocks.deleteSkill.mockRejectedValueOnce(new SkillNotFoundError());
    expect((await skill.DELETE(req("DELETE"), skillCtx)).status).toBe(404);
  });
});

describe("oversized JSON bodies", () => {
  it("answers 413 for a body over 64 KB before anything is parsed", async () => {
    const big = new NextRequest("http://localhost/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ purpose: "x".repeat(70 * 1024) }) });
    const res = await skills.POST(big, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(413);
    const bigPatch = new NextRequest("http://localhost/x", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ purpose: "x".repeat(70 * 1024) }) });
    expect((await skill.PATCH(bigPatch, { params: Promise.resolve({ id: "j1", skillId: "s1" }) })).status).toBe(413);
    expect(mocks.addSkill).not.toHaveBeenCalled();
    expect(mocks.updateSkill).not.toHaveBeenCalled();
  });
});
