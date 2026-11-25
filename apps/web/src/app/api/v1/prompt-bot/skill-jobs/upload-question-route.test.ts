import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  isAiConfigured: vi.fn(),
  after: vi.fn(),
  findOwnedJob: vi.fn(),
  countActiveFiles: vi.fn(),
  storeJobFile: vi.fn(),
  assertTaskQuestion: vi.fn(),
  runFileAnalysis: vi.fn(),
  readBytesWithin: vi.fn(),
}));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: mocks.after }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/ai/config", async (orig) => ({ ...(await orig<typeof import("@/lib/ai/config")>()), isAiConfigured: mocks.isAiConfigured }));
vi.mock("@/lib/ai/claude", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/api/body", async (orig) => ({ ...(await orig<typeof import("@/lib/api/body")>()), readBytesWithin: mocks.readBytesWithin }));
vi.mock("@/lib/skills/jobs/jobs", () => ({ findOwnedJob: mocks.findOwnedJob }));
vi.mock("@/lib/skills/jobs/files", () => ({
  countActiveFiles: mocks.countActiveFiles,
  storeJobFile: mocks.storeJobFile,
  assertTaskQuestion: mocks.assertTaskQuestion,
  runFileAnalysis: mocks.runFileAnalysis,
}));

import { QuestionNotFoundError } from "@/lib/skills/jobs/errors";
import * as upload from "./[id]/files/route";

const ctx = { params: Promise.resolve({ id: "j1" }) };
const uploadReq = (query: string) => new NextRequest(`http://localhost/x?name=logo.png${query}`, { method: "POST", body: new Uint8Array([1, 2]) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTEE" });
  mocks.isAiConfigured.mockReturnValue(true);
  mocks.findOwnedJob.mockResolvedValue({ id: "j1", title: "t", description: "d" });
  mocks.countActiveFiles.mockResolvedValue(0);
  mocks.readBytesWithin.mockResolvedValue({ ok: true, bytes: new Uint8Array([1, 2]) });
  mocks.storeJobFile.mockResolvedValue({ id: "f1", questionId: "q1" });
});

describe("POST /:id/files?questionId=", () => {
  it("stores the file on the question", async () => {
    const res = await upload.POST(uploadReq("&questionId=q1"), ctx);
    expect(res.status).toBe(201);
    expect(mocks.assertTaskQuestion).toHaveBeenCalledWith("j1", "q1");
    expect(mocks.storeJobFile.mock.calls[0][0]).toMatchObject({ jobId: "j1", fileName: "logo.png", questionId: "q1" });
  });

  it("404s another task's or a per-use question before reading the body or spending a unit", async () => {
    mocks.assertTaskQuestion.mockRejectedValue(new QuestionNotFoundError());
    const res = await upload.POST(uploadReq("&questionId=p1"), ctx);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toEqual({ code: "NOT_FOUND", message: "Question not found" });
    expect(mocks.readBytesWithin).not.toHaveBeenCalled();
    expect(mocks.storeJobFile).not.toHaveBeenCalled();
  });

  it("stores a general file without a question id", async () => {
    await upload.POST(uploadReq(""), ctx);
    await upload.POST(uploadReq("&questionId="), ctx);
    expect(mocks.assertTaskQuestion).not.toHaveBeenCalled();
    expect(mocks.storeJobFile.mock.calls.map((c) => c[0].questionId)).toEqual([null, null]);
  });
});
