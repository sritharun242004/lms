import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  jobFindFirst: vi.fn(),
  fileCount: vi.fn(),
  fileFindMany: vi.fn(),
  fileFindFirst: vi.fn(),
  fileCreate: vi.fn(),
  fileUpdate: vi.fn(),
  fileUpdateMany: vi.fn(),
  fileDeleteMany: vi.fn(),
  skillFindFirst: vi.fn(),
  versionFindFirst: vi.fn(),
  executeRaw: vi.fn(),
  transaction: vi.fn(),
  consumeAiUsage: vi.fn(),
  analyseFile: vi.fn(),
  readUpload: vi.fn(),
  imageForClaude: vi.fn(),
  assetFileName: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    skillJob: { findFirst: mocks.jobFindFirst },
    skillJobFile: {
      count: mocks.fileCount,
      findMany: mocks.fileFindMany,
      findFirst: mocks.fileFindFirst,
      create: mocks.fileCreate,
      update: mocks.fileUpdate,
      updateMany: mocks.fileUpdateMany,
      deleteMany: mocks.fileDeleteMany,
    },
    skillJobSkill: { findFirst: mocks.skillFindFirst },
    skillVersion: { findFirst: mocks.versionFindFirst },
    $executeRaw: mocks.executeRaw,
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/ai/usage", async (orig) => ({ ...(await orig<typeof import("@/lib/ai/usage")>()), consumeAiUsage: mocks.consumeAiUsage }));
vi.mock("@/lib/ai/claude", () => ({ analyseFile: mocks.analyseFile }));
vi.mock("../files/extract", () => ({ readUpload: mocks.readUpload }));
vi.mock("../files/image", () => ({ imageForClaude: mocks.imageForClaude }));
vi.mock("../files/safe-name", () => ({ assetFileName: mocks.assetFileName }));

import { Prisma } from "@prisma/client";
import { AiBadRequestError, AiResponseError } from "@/lib/ai/errors";
import { LimitReachedError } from "@/lib/ai/usage";
import { FileReadError, FILE_READ_MESSAGES } from "../files/types";
import { AlreadyAnalysingError, AlreadyGeneratingError, FileNameTakenError, FileNotFoundError, JobNotFoundError, TooManyFilesError } from "./errors";
import {
  ANALYSIS_FAILED_MESSAGE,
  countActiveFiles,
  deleteJobFile,
  loadFileDetail,
  PDF_TOO_LONG_MESSAGE,
  PDF_UNREADABLE_MESSAGE,
  purgeUnreferencedFiles,
  runFileAnalysis,
  saveAnalysisEdit,
  startReanalysis,
  storeJobFile,
} from "./files";

const NOW = new Date("2026-11-25T12:00:00Z");
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000);
const STARTED = new Date("2026-11-25T12:03:00Z");
const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const fileRow = (over: Record<string, unknown> = {}) => ({
  id: "f1",
  jobId: "j1",
  fileName: "Q3 deck.pptx",
  assetName: "q3-deck.pptx",
  kind: "PPTX",
  mimeType: PPTX_MIME,
  size: 4,
  sha256: "abc",
  analysis: null,
  analysisStatus: "PENDING",
  analysisStartedAt: NOW,
  analysisEdited: false,
  analysisError: null,
  deletedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});
const BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
const FACTS = { kind: "PPTX", slideCount: 3 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.jobFindFirst.mockResolvedValue({ id: "j1", title: "t", description: "d" });
  mocks.fileCount.mockResolvedValue(0);
  mocks.fileFindMany.mockResolvedValue([{ assetName: "logo.png" }]);
  mocks.readUpload.mockResolvedValue({ kind: "PPTX", mimeType: PPTX_MIME, facts: FACTS, sha256: "abc" });
  mocks.assetFileName.mockReturnValue("q3-deck.pptx");
  mocks.fileCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => fileRow({ ...data, id: "f1" }));
  mocks.fileUpdateMany.mockResolvedValue({ count: 1 });
  mocks.transaction.mockImplementation(async (ops: unknown[]) => ops);
});

describe("storeJobFile", () => {
  it("reads the upload, spends one skill_analyze unit, names the asset and stores it as pending", async () => {
    const view = await storeJobFile({ jobId: "j1", userId: "u1", fileName: "Q3 deck.pptx", bytes: BYTES }, NOW);
    expect(mocks.readUpload).toHaveBeenCalledWith(BYTES);
    expect(mocks.consumeAiUsage).toHaveBeenCalledWith("u1", "skill_analyze", NOW);
    expect(mocks.assetFileName).toHaveBeenCalledWith("Q3 deck.pptx", "PPTX", ["logo.png"]);
    expect(mocks.fileFindMany).toHaveBeenCalledWith({ where: { jobId: "j1" }, select: { assetName: true } });
    const create = mocks.fileCreate.mock.calls[0][0];
    expect(create.omit).toEqual({ data: true, facts: true });
    expect(create.data).toMatchObject({
      jobId: "j1",
      fileName: "Q3 deck.pptx",
      assetName: "q3-deck.pptx",
      kind: "PPTX",
      mimeType: PPTX_MIME,
      size: 4,
      sha256: "abc",
      facts: FACTS,
      analysisStatus: "PENDING",
      analysisStartedAt: NOW,
    });
    expect(Buffer.from(create.data.data).equals(Buffer.from(BYTES))).toBe(true);
    expect(view).toMatchObject({ id: "f1", analysisStatus: "PENDING", bundlable: true });
  });

  it("refuses an unreadable file before spending anything or storing it", async () => {
    mocks.readUpload.mockRejectedValue(new FileReadError("FILE_ENCRYPTED", FILE_READ_MESSAGES.ole));
    await expect(storeJobFile({ jobId: "j1", userId: "u1", fileName: "x.pptx", bytes: BYTES }, NOW)).rejects.toBeInstanceOf(FileReadError);
    expect(mocks.consumeAiUsage).not.toHaveBeenCalled();
    expect(mocks.fileCreate).not.toHaveBeenCalled();
  });

  it("re-checks the file count and the owner, and stores nothing when the daily limit is reached", async () => {
    mocks.fileCount.mockResolvedValue(10);
    await expect(storeJobFile({ jobId: "j1", userId: "u1", fileName: "x.pptx", bytes: BYTES }, NOW)).rejects.toBeInstanceOf(TooManyFilesError);
    expect(mocks.consumeAiUsage).not.toHaveBeenCalled();
    mocks.fileCount.mockResolvedValue(0);
    mocks.consumeAiUsage.mockRejectedValueOnce(new LimitReachedError("skill_analyze", NOW));
    await expect(storeJobFile({ jobId: "j1", userId: "u1", fileName: "x.pptx", bytes: BYTES }, NOW)).rejects.toBeInstanceOf(LimitReachedError);
    expect(mocks.fileCreate).not.toHaveBeenCalled();
    mocks.jobFindFirst.mockResolvedValue(null);
    await expect(storeJobFile({ jobId: "j1", userId: "u2", fileName: "x.pptx", bytes: BYTES }, NOW)).rejects.toBeInstanceOf(JobNotFoundError);
  });

  const dup = () => new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" });

  it("picks the name again from a fresh read once when a concurrent upload took the same asset name (unique index)", async () => {
    mocks.fileCreate.mockRejectedValueOnce(dup());
    mocks.fileFindMany.mockResolvedValueOnce([{ assetName: "logo.png" }]).mockResolvedValueOnce([{ assetName: "logo.png" }, { assetName: "q3-deck.pptx" }]);
    mocks.assetFileName.mockReturnValueOnce("q3-deck.pptx").mockReturnValueOnce("q3-deck-2.pptx");
    const view = await storeJobFile({ jobId: "j1", userId: "u1", fileName: "Q3 deck.pptx", bytes: BYTES }, NOW);
    expect(mocks.fileFindMany).toHaveBeenCalledTimes(2);
    expect(mocks.assetFileName).toHaveBeenLastCalledWith("Q3 deck.pptx", "PPTX", ["logo.png", "q3-deck.pptx"]);
    expect(mocks.fileCreate).toHaveBeenCalledTimes(2);
    expect(mocks.fileCreate.mock.calls[1][0].data.assetName).toBe("q3-deck-2.pptx");
    expect(mocks.consumeAiUsage).toHaveBeenCalledTimes(1);
    expect(view.id).toBe("f1");
  });

  it("answers a name conflict (not TooManyFiles) when the retry loses the race too", async () => {
    mocks.fileCreate.mockRejectedValue(dup());
    const error = await storeJobFile({ jobId: "j1", userId: "u1", fileName: "x.pptx", bytes: BYTES }, NOW).catch((e: unknown) => e);
    expect(error).toEqual(new FileNameTakenError("x.pptx"));
    expect(error).not.toBeInstanceOf(TooManyFilesError);
    expect(mocks.fileCreate).toHaveBeenCalledTimes(2);
  });

  it("counts only files that are not removed", async () => {
    mocks.fileCount.mockResolvedValue(3);
    expect(await countActiveFiles("j1")).toBe(3);
    expect(mocks.fileCount).toHaveBeenCalledWith({ where: { jobId: "j1", deletedAt: null } });
  });
});

describe("runFileAnalysis", () => {
  const withData = (over: Record<string, unknown> = {}) => fileRow({ data: Buffer.from("PDFBYTES"), facts: FACTS, ...over });
  const finished = () => mocks.fileUpdateMany.mock.calls.at(-1)![0];
  // The run re-stamps its claim when it gets a slot; only Date is faked, so promises and real timers still run.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(STARTED);
  });
  afterEach(() => vi.useRealTimers());

  it("refreshes the claim when the run gets a slot, so time spent queued does not count against the stale window", async () => {
    mocks.fileFindFirst.mockResolvedValue(withData());
    mocks.analyseFile.mockResolvedValue("guide");
    await runFileAnalysis("j1", "f1", "u1");
    expect(mocks.fileUpdateMany.mock.calls[0][0]).toEqual({
      where: { id: "f1", analysisStatus: "PENDING", analysisStartedAt: NOW },
      data: { analysisStartedAt: STARTED },
    });
    expect(finished().where).toEqual({ id: "f1", analysisStatus: "PENDING", analysisStartedAt: STARTED });
  });

  it("skips the AI and writes nothing more when the claim was lost while queued", async () => {
    mocks.fileFindFirst.mockResolvedValue(withData());
    mocks.fileUpdateMany.mockResolvedValueOnce({ count: 0 });
    await runFileAnalysis("j1", "f1", "u1");
    expect(mocks.analyseFile).not.toHaveBeenCalled();
    expect(mocks.fileFindFirst).toHaveBeenCalledTimes(1);
    expect(mocks.fileUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("runs at most two analyses at once; a third waits until one finishes", async () => {
    mocks.fileFindFirst.mockResolvedValue(withData());
    const release: (() => void)[] = [];
    mocks.analyseFile.mockImplementation(() => new Promise<string>((resolve) => release.push(() => resolve("guide"))));
    const runs = ["f1", "f2", "f3"].map((id) => runFileAnalysis("j1", id, "u1"));
    await vi.waitFor(() => expect(mocks.analyseFile).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mocks.analyseFile).toHaveBeenCalledTimes(2);
    // The queued run has neither re-stamped its claim nor loaded its bytes.
    expect(mocks.fileUpdateMany.mock.calls.map(([a]) => a.where.id)).toEqual(["f1", "f2"]);
    release[0]();
    await vi.waitFor(() => expect(mocks.analyseFile).toHaveBeenCalledTimes(3));
    release[1]();
    release[2]();
    await Promise.all(runs);
    expect(mocks.fileUpdateMany.mock.calls.filter(([a]) => a.data.analysisStatus === "READY")).toHaveLength(3);
  });

  it("writes the analysis for an Office file from its facts, only if the claim is still ours", async () => {
    mocks.fileFindFirst.mockResolvedValue(withData());
    mocks.analyseFile.mockResolvedValue("## Colours\n- #1F4E79");
    await runFileAnalysis("j1", "f1", "u1");
    // The bytes are read only once the run holds an analysis slot.
    expect(mocks.fileFindFirst.mock.calls[0][0]).toEqual({ where: { id: "f1", jobId: "j1", deletedAt: null, job: { userId: "u1" } }, omit: { data: true } });
    expect(mocks.fileFindFirst.mock.calls[1][0]).toEqual({ where: { id: "f1" }, select: { data: true } });
    const content = mocks.analyseFile.mock.calls[0][0];
    expect(content.document).toBeUndefined();
    expect(content.image).toBeUndefined();
    expect(content.text).toContain('<file name="Q3 deck.pptx" kind="PPTX">');
    expect(finished()).toEqual({
      where: { id: "f1", analysisStatus: "PENDING", analysisStartedAt: STARTED },
      data: { analysisStatus: "READY", analysis: "## Colours\n- #1F4E79", analysisEdited: false, analysisError: null },
    });
  });

  it("sends a PDF as a document block titled with its asset name", async () => {
    mocks.fileFindFirst.mockResolvedValue(withData({ kind: "PDF", assetName: "brand.pdf", facts: { kind: "PDF", version: "1.7", pages: 12, title: null } }));
    mocks.analyseFile.mockResolvedValue("guide");
    await runFileAnalysis("j1", "f1", "u1");
    expect(mocks.analyseFile.mock.calls[0][0].document).toEqual({ base64: Buffer.from("PDFBYTES").toString("base64"), title: "brand.pdf" });
  });

  it("skips the AI for a PDF over 100 pages and says why", async () => {
    mocks.fileFindFirst.mockResolvedValue(withData({ kind: "PDF", facts: { kind: "PDF", version: "1.7", pages: 101, title: null } }));
    await runFileAnalysis("j1", "f1", "u1");
    expect(mocks.analyseFile).not.toHaveBeenCalled();
    expect(finished().data).toEqual({ analysisStatus: "FAILED", analysisError: PDF_TOO_LONG_MESSAGE });
  });

  it("says the PDF could not be read when Claude refuses it with a 400 (page count unknown)", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.fileFindFirst.mockResolvedValue(withData({ kind: "PDF", facts: { kind: "PDF", version: "1.7", pages: null, title: null } }));
    mocks.analyseFile.mockRejectedValue(new AiBadRequestError());
    await runFileAnalysis("j1", "f1", "u1");
    expect(finished().data).toEqual({ analysisStatus: "FAILED", analysisError: PDF_UNREADABLE_MESSAGE });
    expect(PDF_UNREADABLE_MESSAGE).toContain("add the analysis by hand");
    mocks.fileFindFirst.mockResolvedValue(withData());
    mocks.analyseFile.mockRejectedValue(new AiBadRequestError());
    await runFileAnalysis("j1", "f1", "u1");
    expect(finished().data).toEqual({ analysisStatus: "FAILED", analysisError: ANALYSIS_FAILED_MESSAGE });
    log.mockRestore();
  });

  it("sends images through the resized copy", async () => {
    mocks.fileFindFirst.mockResolvedValue(withData({ kind: "PNG", facts: { kind: "PNG", width: 4000, height: 3000 } }));
    mocks.imageForClaude.mockResolvedValue({ mediaType: "image/png", base64: "c21hbGw=" });
    mocks.analyseFile.mockResolvedValue("guide");
    await runFileAnalysis("j1", "f1", "u1");
    expect(mocks.imageForClaude).toHaveBeenCalledWith(expect.any(Uint8Array), "PNG");
    expect(mocks.analyseFile.mock.calls[0][0].image).toEqual({ base64: "c21hbGw=", mediaType: "image/png" });
  });

  it("records a failure without throwing or logging content", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.fileFindFirst.mockResolvedValue(withData());
    mocks.analyseFile.mockRejectedValue(new AiResponseError("Claude stopped with refusal"));
    await expect(runFileAnalysis("j1", "f1", "u1")).resolves.toBeUndefined();
    expect(finished()).toEqual({
      where: { id: "f1", analysisStatus: "PENDING", analysisStartedAt: STARTED },
      data: { analysisStatus: "FAILED", analysisError: ANALYSIS_FAILED_MESSAGE },
    });
    expect(log).toHaveBeenCalledWith("[skills-builder] file analysis failed:", "AiResponseError");
    expect(JSON.stringify(log.mock.calls)).not.toContain("Q3 deck");
    log.mockRestore();
  });

  it("does nothing for a removed, foreign or already finished file", async () => {
    mocks.fileFindFirst.mockResolvedValue(null);
    await runFileAnalysis("j1", "f1", "u1");
    mocks.fileFindFirst.mockResolvedValue(withData({ analysisStatus: "READY" }));
    await runFileAnalysis("j1", "f1", "u1");
    expect(mocks.analyseFile).not.toHaveBeenCalled();
    expect(mocks.fileUpdateMany).not.toHaveBeenCalled();
  });
});

describe("startReanalysis", () => {
  it("claims a ready file, spends one unit and returns it as pending", async () => {
    mocks.fileFindFirst.mockResolvedValue(fileRow({ analysisStatus: "READY", analysis: "old", analysisStartedAt: minutesAgo(30) }));
    const view = await startReanalysis("j1", "f1", "u1", NOW);
    const claim = mocks.fileUpdateMany.mock.calls[0][0];
    expect(claim.where.id).toBe("f1");
    expect(claim.where.OR).toEqual([{ analysisStatus: { not: "PENDING" } }, { analysisStartedAt: null }, { analysisStartedAt: { lt: minutesAgo(5) } }]);
    expect(claim.data).toEqual({ analysisStatus: "PENDING", analysisStartedAt: NOW, analysisError: null });
    expect(mocks.consumeAiUsage).toHaveBeenCalledWith("u1", "skill_analyze", NOW);
    expect(view.analysisStatus).toBe("PENDING");
  });

  it("re-claims an interrupted analysis but refuses a fresh one (Review Focus 1)", async () => {
    mocks.fileFindFirst.mockResolvedValue(fileRow({ analysisStatus: "PENDING", analysisStartedAt: minutesAgo(6) }));
    await expect(startReanalysis("j1", "f1", "u1", NOW)).resolves.toMatchObject({ analysisStatus: "PENDING" });
    mocks.fileFindFirst.mockResolvedValue(fileRow({ analysisStatus: "PENDING", analysisStartedAt: minutesAgo(1) }));
    await expect(startReanalysis("j1", "f1", "u1", NOW)).rejects.toBeInstanceOf(AlreadyAnalysingError);
    mocks.fileFindFirst.mockResolvedValue(fileRow({ analysisStatus: "READY" }));
    mocks.fileUpdateMany.mockResolvedValueOnce({ count: 0 });
    await expect(startReanalysis("j1", "f1", "u1", NOW)).rejects.toBeInstanceOf(AlreadyAnalysingError);
  });

  it("hands the claim back when the daily limit is reached", async () => {
    mocks.fileFindFirst.mockResolvedValue(fileRow({ analysisStatus: "FAILED", analysisError: "x", analysisStartedAt: minutesAgo(30) }));
    mocks.consumeAiUsage.mockRejectedValueOnce(new LimitReachedError("skill_analyze", NOW));
    await expect(startReanalysis("j1", "f1", "u1", NOW)).rejects.toBeInstanceOf(LimitReachedError);
    expect(mocks.fileUpdateMany.mock.calls[1][0]).toEqual({
      where: { id: "f1", analysisStatus: "PENDING", analysisStartedAt: NOW },
      data: { analysisStatus: "FAILED", analysisStartedAt: minutesAgo(30), analysisError: "x" },
    });
  });

  it("404s a missing file", async () => {
    mocks.fileFindFirst.mockResolvedValue(null);
    await expect(startReanalysis("j1", "f1", "u2", NOW)).rejects.toBeInstanceOf(FileNotFoundError);
  });
});

describe("saveAnalysisEdit", () => {
  it("stores the user's text as an edited, ready analysis", async () => {
    mocks.fileFindFirst.mockResolvedValue(fileRow({ analysisStatus: "FAILED" }));
    mocks.fileUpdate.mockResolvedValue(fileRow({ analysisStatus: "READY", analysis: "Mine", analysisEdited: true }));
    const view = await saveAnalysisEdit("j1", "f1", "u1", "  Mine  ", NOW);
    expect(mocks.fileUpdate).toHaveBeenCalledWith({
      where: { id: "f1" },
      data: { analysis: "Mine", analysisEdited: true, analysisStatus: "READY", analysisError: null },
      omit: { data: true, facts: true },
    });
    expect(view).toMatchObject({ analysis: "Mine", analysisEdited: true });
  });

  it("refuses while an analysis is running", async () => {
    mocks.fileFindFirst.mockResolvedValue(fileRow({ analysisStatus: "PENDING", analysisStartedAt: minutesAgo(1) }));
    await expect(saveAnalysisEdit("j1", "f1", "u1", "x", NOW)).rejects.toBeInstanceOf(AlreadyAnalysingError);
  });
});

describe("deleteJobFile and purge (Review Focus 3)", () => {
  beforeEach(() => {
    mocks.fileFindFirst.mockResolvedValue({ id: "f1" });
    mocks.skillFindFirst.mockResolvedValue(null);
  });

  it("soft-deletes a file a version bundles and removes it from every skill", async () => {
    mocks.versionFindFirst.mockResolvedValue({ id: "v1" });
    expect(await deleteJobFile("j1", "f1", "u1", NOW)).toBe("soft");
    expect(mocks.versionFindFirst).toHaveBeenCalledWith({ where: { skill: { jobId: "j1" }, assetFileIds: { has: "f1" } }, select: { id: true } });
    expect(mocks.fileUpdateMany).toHaveBeenCalledWith({ where: { id: "f1" }, data: { deletedAt: NOW } });
    expect(mocks.fileDeleteMany).not.toHaveBeenCalled();
    const sql = (mocks.executeRaw.mock.calls[0][0] as TemplateStringsArray).join("?");
    expect(sql).toContain('UPDATE "skill_job_skills" SET "file_ids" = array_remove("file_ids", ?) WHERE "job_id" = ?');
    expect(mocks.executeRaw.mock.calls[0].slice(1)).toEqual(["f1", "j1"]);
  });

  it("hard-deletes a file no version needs", async () => {
    mocks.versionFindFirst.mockResolvedValue(null);
    expect(await deleteJobFile("j1", "f1", "u1", NOW)).toBe("hard");
    expect(mocks.fileDeleteMany).toHaveBeenCalledWith({ where: { id: "f1" } });
  });

  it("refuses while a skill of the job is being written, and 404s a foreign file", async () => {
    mocks.skillFindFirst.mockResolvedValue({ id: "s1" });
    await expect(deleteJobFile("j1", "f1", "u1", NOW)).rejects.toBeInstanceOf(AlreadyGeneratingError);
    expect(mocks.skillFindFirst).toHaveBeenCalledWith({
      where: { jobId: "j1", status: "GENERATING", generationStartedAt: { gt: minutesAgo(10) } },
      select: { id: true },
    });
    mocks.fileFindFirst.mockResolvedValue(null);
    await expect(deleteJobFile("j1", "f1", "u2", NOW)).rejects.toBeInstanceOf(FileNotFoundError);
  });

  it("purges removed files that no version references", async () => {
    mocks.executeRaw.mockResolvedValue(2);
    expect(await purgeUnreferencedFiles("j1")).toBe(2);
    const sql = (mocks.executeRaw.mock.calls[0][0] as TemplateStringsArray).join("?");
    expect(sql).toContain('DELETE FROM "skill_job_files"');
    expect(sql).toContain('"deleted_at" IS NOT NULL');
    expect(sql).toContain('= ANY(v."asset_file_ids")');
    expect(mocks.executeRaw.mock.calls[0].slice(1)).toEqual(["j1", "j1"]);
  });
});

describe("loadFileDetail", () => {
  it("returns the view plus the facts, never the bytes", async () => {
    mocks.fileFindFirst.mockResolvedValue(fileRow({ analysisStatus: "READY", facts: FACTS }));
    expect(await loadFileDetail("j1", "f1", "u1")).toMatchObject({ id: "f1", facts: FACTS });
    expect(mocks.fileFindFirst).toHaveBeenCalledWith({ where: { id: "f1", jobId: "j1", deletedAt: null, job: { userId: "u1" } }, omit: { data: true } });
    mocks.fileFindFirst.mockResolvedValue(null);
    expect(await loadFileDetail("j1", "f1", "u2")).toBeNull();
  });
});
