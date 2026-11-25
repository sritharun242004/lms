import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  isAiConfigured: vi.fn(),
  start: vi.fn(),
  run: vi.fn(),
  after: vi.fn(),
}));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: mocks.after }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/ai/config", async (orig) => ({ ...(await orig<typeof import("@/lib/ai/config")>()), isAiConfigured: mocks.isAiConfigured }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/skills/jobs/generate", () => ({ startJobSkillGeneration: mocks.start, runJobSkillGeneration: mocks.run }));

import { LimitReachedError } from "@/lib/ai/usage";
import { AlreadyGeneratingError, EmptyDescriptionError, FilesAnalysingError, SkillNotFoundError } from "@/lib/skills/jobs/errors";
import * as generate from "./[id]/skills/[skillId]/generate/route";

const post = () => new NextRequest("http://localhost/x", { method: "POST" });
const ctx = { params: Promise.resolve({ id: "j1", skillId: "s1" }) };
const codeOf = async (res: Response) => (await res.json()).error.code;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTEE" });
  mocks.isAiConfigured.mockReturnValue(true);
  mocks.start.mockResolvedValue({ id: "s1", status: "GENERATING" });
});

describe("POST /skill-jobs/:id/skills/:skillId/generate", () => {
  it("claims the skill, answers 202 and writes it after the response", async () => {
    const res = await generate.POST(post(), ctx);
    expect(res.status).toBe(202);
    expect((await res.json()).data.status).toBe("GENERATING");
    expect(mocks.start).toHaveBeenCalledWith("j1", "s1", "u1");
    expect(mocks.run).not.toHaveBeenCalled();
    await mocks.after.mock.calls[0][0]();
    expect(mocks.run).toHaveBeenCalledWith("j1", "s1", "u1");
  });

  it("answers 503 before anything else when the AI is not configured, and 401 without a session", async () => {
    mocks.isAiConfigured.mockReturnValue(false);
    const res = await generate.POST(post(), ctx);
    expect(res.status).toBe(503);
    expect(await codeOf(res)).toBe("AI_NOT_CONFIGURED");
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await generate.POST(post(), ctx)).status).toBe(401);
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it.each([
    [new SkillNotFoundError(), 404, "NOT_FOUND"],
    [new AlreadyGeneratingError(), 409, "ALREADY_GENERATING"],
    [new FilesAnalysingError(), 409, "FILES_ANALYSING"],
    [new EmptyDescriptionError(), 400, "VALIDATION_ERROR"],
    [new LimitReachedError("skill_generate", new Date("2026-11-26T00:00:00Z")), 429, "LIMIT_REACHED"],
  ])("maps %s", async (error, status, code) => {
    mocks.start.mockRejectedValueOnce(error);
    const res = await generate.POST(post(), ctx);
    expect(res.status).toBe(status);
    expect(await codeOf(res)).toBe(code);
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("lets an unexpected error surface", async () => {
    mocks.start.mockRejectedValueOnce(new Error("database down"));
    await expect(generate.POST(post(), ctx)).rejects.toThrow("database down");
  });
});
