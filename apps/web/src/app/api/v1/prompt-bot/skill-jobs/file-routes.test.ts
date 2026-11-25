import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  isAiConfigured: vi.fn(),
  after: vi.fn(),
  findOwnedJob: vi.fn(),
  countActiveFiles: vi.fn(),
  storeJobFile: vi.fn(),
  runFileAnalysis: vi.fn(),
  startReanalysis: vi.fn(),
  saveAnalysisEdit: vi.fn(),
  deleteJobFile: vi.fn(),
  loadFileDetail: vi.fn(),
}));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: mocks.after }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/ai/config", async (orig) => ({ ...(await orig<typeof import("@/lib/ai/config")>()), isAiConfigured: mocks.isAiConfigured }));
vi.mock("@/lib/ai/claude", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/skills/jobs/jobs", () => ({ findOwnedJob: mocks.findOwnedJob }));
vi.mock("@/lib/skills/jobs/files", () => ({
  countActiveFiles: mocks.countActiveFiles,
  storeJobFile: mocks.storeJobFile,
  runFileAnalysis: mocks.runFileAnalysis,
  startReanalysis: mocks.startReanalysis,
  saveAnalysisEdit: mocks.saveAnalysisEdit,
  deleteJobFile: mocks.deleteJobFile,
  loadFileDetail: mocks.loadFileDetail,
}));

import { LimitReachedError } from "@/lib/ai/usage";
import { FileReadError, FILE_READ_MESSAGES } from "@/lib/skills/files/types";
import { AlreadyAnalysingError, AlreadyGeneratingError, FileNotFoundError, TooManyFilesError } from "@/lib/skills/jobs/errors";
import * as analyse from "./[id]/files/[fileId]/analyse/route";
import * as file from "./[id]/files/[fileId]/route";
import * as upload from "./[id]/files/route";

type Init = ConstructorParameters<typeof NextRequest>[1];
const ctx = { params: Promise.resolve({ id: "j1" }) };
const fileCtx = { params: Promise.resolve({ id: "j1", fileId: "f1" }) };
const VIEW = { id: "f1", analysisStatus: "PENDING" };
const uploadReq = (body: BodyInit | ReadableStream<Uint8Array> | undefined, name: string | null = "Q3 deck.pptx") =>
  new NextRequest(`http://localhost/x${name === null ? "" : `?name=${encodeURIComponent(name)}`}`, {
    method: "POST",
    body,
    duplex: "half",
  } as Init);
const jsonReq = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/x", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const error = async (res: Response) => ({ status: res.status, ...(await res.json()).error });

/** A body that sends 10 bytes and then fails, like a dropped mobile connection. */
const droppedStream = () =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(10));
      controller.error(new Error("connection reset"));
    },
  });
/** 21 chunks of 1 MB without allocating 21 MB. */
const oversizedStream = () => {
  const chunk = new Uint8Array(1024 * 1024);
  let sent = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent++ < 21) controller.enqueue(chunk);
      else controller.close();
    },
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTEE" });
  mocks.isAiConfigured.mockReturnValue(true);
  mocks.findOwnedJob.mockResolvedValue({ id: "j1", title: "t", description: "d" });
  mocks.countActiveFiles.mockResolvedValue(0);
  mocks.storeJobFile.mockResolvedValue(VIEW);
});

describe("POST /skill-jobs/[id]/files", () => {
  it("stores the bytes, answers 201 and analyses after the response", async () => {
    const res = await upload.POST(uploadReq(new Uint8Array([1, 2, 3])), ctx);
    expect(res.status).toBe(201);
    expect((await res.json()).data).toEqual(VIEW);
    const input = mocks.storeJobFile.mock.calls[0][0];
    expect(input).toMatchObject({ jobId: "j1", userId: "u1", fileName: "Q3 deck.pptx", questionId: null });
    expect([...input.bytes]).toEqual([1, 2, 3]);
    expect(mocks.runFileAnalysis).not.toHaveBeenCalled();
    await mocks.after.mock.calls[0][0]();
    expect(mocks.runFileAnalysis).toHaveBeenCalledWith("j1", "f1", "u1");
  });

  it("keeps only the base name and strips control characters from the file name", async () => {
    await upload.POST(uploadReq(new Uint8Array([1]), "C:\\Users\\me\\Q3\u0007 deck.pptx"), ctx);
    expect(mocks.storeJobFile.mock.calls[0][0].fileName).toBe("Q3 deck.pptx");
  });

  it("refuses without a session, without the AI, and without a usable name", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);
    expect((await upload.POST(uploadReq(new Uint8Array([1])), ctx)).status).toBe(401);
    mocks.isAiConfigured.mockReturnValueOnce(false);
    expect(await error(await upload.POST(uploadReq(new Uint8Array([1])), ctx))).toMatchObject({ status: 503, code: "AI_NOT_CONFIGURED" });
    expect((await upload.POST(uploadReq(new Uint8Array([1]), null), ctx)).status).toBe(400);
    expect((await upload.POST(uploadReq(new Uint8Array([1]), "   "), ctx)).status).toBe(400);
    expect((await upload.POST(uploadReq(new Uint8Array([1]), `${"a".repeat(256)}.pptx`), ctx)).status).toBe(400);
    expect(mocks.storeJobFile).not.toHaveBeenCalled();
  });

  it("404s someone else's job and 409s a full job before reading the body", async () => {
    mocks.findOwnedJob.mockResolvedValueOnce(null);
    expect((await upload.POST(uploadReq(new Uint8Array([1])), ctx)).status).toBe(404);
    mocks.countActiveFiles.mockResolvedValueOnce(10);
    expect(await error(await upload.POST(uploadReq(new Uint8Array([1])), ctx))).toMatchObject({ status: 409, code: "TOO_MANY_FILES" });
    expect(mocks.storeJobFile).not.toHaveBeenCalled();
  });

  it("refuses a body over 20 MB with 413", async () => {
    expect(await error(await upload.POST(uploadReq(oversizedStream()), ctx))).toEqual({
      status: 413,
      code: "FILE_TOO_LARGE",
      message: "Files can be up to 20 MB.",
    });
    expect(mocks.storeJobFile).not.toHaveBeenCalled();
  });

  it("stores nothing and spends nothing when the connection drops mid-upload (Review Focus 2)", async () => {
    expect(await error(await upload.POST(uploadReq(droppedStream()), ctx))).toEqual({
      status: 400,
      code: "UPLOAD_INCOMPLETE",
      message: "The upload didn't finish. Try again.",
    });
    expect(mocks.storeJobFile).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("refuses an empty file", async () => {
    expect(await error(await upload.POST(uploadReq(new Uint8Array(0)), ctx))).toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
  });

  it("maps unreadable, encrypted and unsupported files, the file cap and the daily limit", async () => {
    mocks.storeJobFile.mockRejectedValueOnce(new FileReadError("UNSUPPORTED_FILE", FILE_READ_MESSAGES.unsupported));
    expect(await error(await upload.POST(uploadReq(new Uint8Array([1])), ctx))).toEqual({ status: 415, code: "UNSUPPORTED_FILE", message: FILE_READ_MESSAGES.unsupported });
    mocks.storeJobFile.mockRejectedValueOnce(new FileReadError("FILE_ENCRYPTED", FILE_READ_MESSAGES.ole));
    expect((await upload.POST(uploadReq(new Uint8Array([1])), ctx)).status).toBe(422);
    mocks.storeJobFile.mockRejectedValueOnce(new FileReadError("FILE_UNREADABLE", FILE_READ_MESSAGES.unreadable));
    expect((await upload.POST(uploadReq(new Uint8Array([1])), ctx)).status).toBe(422);
    mocks.storeJobFile.mockRejectedValueOnce(new TooManyFilesError());
    expect((await upload.POST(uploadReq(new Uint8Array([1])), ctx)).status).toBe(409);
    mocks.storeJobFile.mockRejectedValueOnce(new LimitReachedError("skill_analyze", new Date("2026-11-26T00:00:00Z")));
    expect(await error(await upload.POST(uploadReq(new Uint8Array([1])), ctx))).toMatchObject({ status: 429, code: "LIMIT_REACHED" });
    expect(mocks.after).not.toHaveBeenCalled();
  });
});

describe("/skill-jobs/[id]/files/[fileId]", () => {
  it("returns the detail with facts, or 404", async () => {
    mocks.loadFileDetail.mockResolvedValueOnce({ id: "f1", facts: { kind: "PDF" } });
    const res = await file.GET(jsonReq("GET"), fileCtx);
    expect((await res.json()).data.facts).toEqual({ kind: "PDF" });
    expect(mocks.loadFileDetail).toHaveBeenCalledWith("j1", "f1", "u1");
    mocks.loadFileDetail.mockResolvedValueOnce(null);
    expect(await error(await file.GET(jsonReq("GET"), fileCtx))).toMatchObject({ status: 404, message: "File not found" });
  });

  it("saves an edited analysis and refuses empty, oversized or running ones", async () => {
    mocks.saveAnalysisEdit.mockResolvedValueOnce({ id: "f1", analysisEdited: true });
    expect((await file.PATCH(jsonReq("PATCH", { analysis: "Mine" }), fileCtx)).status).toBe(200);
    expect(mocks.saveAnalysisEdit).toHaveBeenCalledWith("j1", "f1", "u1", "Mine");
    expect((await file.PATCH(jsonReq("PATCH", { analysis: "   " }), fileCtx)).status).toBe(400);
    expect((await file.PATCH(jsonReq("PATCH", { analysis: "x".repeat(12_001) }), fileCtx)).status).toBe(400);
    expect(await error(await file.PATCH(jsonReq("PATCH", { analysis: "x".repeat(70 * 1024) }), fileCtx))).toMatchObject({ status: 413, code: "PAYLOAD_TOO_LARGE" });
    mocks.saveAnalysisEdit.mockRejectedValueOnce(new AlreadyAnalysingError());
    expect(await error(await file.PATCH(jsonReq("PATCH", { analysis: "x" }), fileCtx))).toMatchObject({ status: 409, code: "ALREADY_ANALYSING" });
    mocks.saveAnalysisEdit.mockRejectedValueOnce(new FileNotFoundError());
    expect((await file.PATCH(jsonReq("PATCH", { analysis: "x" }), fileCtx)).status).toBe(404);
  });

  it("removes a file, refusing while a skill is being written", async () => {
    mocks.deleteJobFile.mockResolvedValueOnce("soft");
    expect((await (await file.DELETE(jsonReq("DELETE"), fileCtx)).json()).data).toEqual({ deleted: true });
    mocks.deleteJobFile.mockRejectedValueOnce(new AlreadyGeneratingError());
    expect(await error(await file.DELETE(jsonReq("DELETE"), fileCtx))).toMatchObject({ status: 409, code: "ALREADY_GENERATING" });
    mocks.deleteJobFile.mockRejectedValueOnce(new FileNotFoundError());
    expect((await file.DELETE(jsonReq("DELETE"), fileCtx)).status).toBe(404);
  });
});

describe("POST /skill-jobs/[id]/files/[fileId]/analyse", () => {
  it("claims, answers 202 and analyses after the response", async () => {
    mocks.startReanalysis.mockResolvedValueOnce(VIEW);
    const res = await analyse.POST(jsonReq("POST"), fileCtx);
    expect(res.status).toBe(202);
    expect(mocks.startReanalysis).toHaveBeenCalledWith("j1", "f1", "u1");
    await mocks.after.mock.calls[0][0]();
    expect(mocks.runFileAnalysis).toHaveBeenCalledWith("j1", "f1", "u1");
  });

  it("maps 503, 404, 409 and 429 without scheduling anything", async () => {
    mocks.isAiConfigured.mockReturnValueOnce(false);
    expect((await analyse.POST(jsonReq("POST"), fileCtx)).status).toBe(503);
    mocks.startReanalysis.mockRejectedValueOnce(new FileNotFoundError());
    expect((await analyse.POST(jsonReq("POST"), fileCtx)).status).toBe(404);
    mocks.startReanalysis.mockRejectedValueOnce(new AlreadyAnalysingError());
    expect((await analyse.POST(jsonReq("POST"), fileCtx)).status).toBe(409);
    mocks.startReanalysis.mockRejectedValueOnce(new LimitReachedError("skill_analyze", new Date("2026-11-26T00:00:00Z")));
    expect((await analyse.POST(jsonReq("POST"), fileCtx)).status).toBe(429);
    expect(mocks.after).not.toHaveBeenCalled();
  });
});
