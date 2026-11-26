import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  jobFindFirst: vi.fn(),
  questionFindFirst: vi.fn(),
  fileCount: vi.fn(),
  fileFindFirst: vi.fn(),
  fileFindMany: vi.fn(),
  fileCreate: vi.fn(),
  upCount: vi.fn(),
  upCreate: vi.fn(),
  upFindFirst: vi.fn(),
  upFindMany: vi.fn(),
  upDelete: vi.fn(),
  upDeleteMany: vi.fn(),
  transaction: vi.fn(),
  consumeAiUsage: vi.fn(),
  refundAiUsage: vi.fn(),
  readUpload: vi.fn(),
  send: vi.fn(),
  getSignedUrl: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    skillJob: { findFirst: m.jobFindFirst },
    skillJobQuestion: { findFirst: m.questionFindFirst },
    skillJobFile: {
      count: m.fileCount,
      findFirst: m.fileFindFirst,
      findMany: m.fileFindMany,
      create: m.fileCreate,
    },
    skillJobFileUpload: {
      count: m.upCount,
      create: m.upCreate,
      findFirst: m.upFindFirst,
      findMany: m.upFindMany,
      delete: m.upDelete,
      deleteMany: m.upDeleteMany,
    },
    $transaction: m.transaction,
  },
}));
vi.mock("@/lib/ai/usage", async (orig) => ({
  ...(await orig<typeof import("@/lib/ai/usage")>()),
  consumeAiUsage: m.consumeAiUsage,
  refundAiUsage: m.refundAiUsage,
}));
vi.mock("@/lib/ai/claude", () => ({ analyseFile: vi.fn() }));
vi.mock("../files/extract", () => ({ readUpload: m.readUpload }));
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: m.getSignedUrl,
}));
vi.mock("@aws-sdk/client-s3", () => {
  const command = (name: string) =>
    class {
      readonly name = name;
      constructor(readonly input: Record<string, unknown>) {}
    };
  return {
    S3Client: class {
      send = m.send;
    },
    PutObjectCommand: command("Put"),
    GetObjectCommand: command("Get"),
    HeadObjectCommand: command("Head"),
    DeleteObjectCommand: command("Delete"),
  };
});

import { LimitReachedError } from "@/lib/ai/usage";
import { FILE_READ_MESSAGES } from "../files/types";
import {
  FileTooLargeError,
  JobNotFoundError,
  QuestionNotFoundError,
  TooManyFilesError,
  UploadExpiredError,
  UploadNotFinishedError,
  UploadSizeMismatchError,
} from "./errors";
import {
  completeJobFileUpload,
  createJobFileUpload,
  sweepAbandonedUploads,
} from "./uploads";

const MB = 1024 * 1024;
const NOW = new Date("2026-11-26T12:00:00Z");
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000);
const PDF_HEAD = Buffer.from("%PDF-1.7");
const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const upload = (over: Record<string, unknown> = {}) => ({
  id: "u1",
  jobId: "j1",
  fileName: "Brand.pdf",
  kind: "PDF",
  size: 60 * MB,
  storageKey: "skills/j1/u1",
  questionId: "q1",
  createdAt: minutesAgo(2),
  ...over,
});
type Command = { name: string; input: Record<string, unknown> };
const commands = (name: string) =>
  m.send.mock.calls.map((c) => c[0] as Command).filter((c) => c.name === name);
/** S3 stand-in: Head answers the stored size; Get streams the stored bytes (or the asked range of them). */
function s3Holds(bytes: Buffer, size = bytes.byteLength) {
  m.send.mockImplementation(async (cmd: Command) => {
    if (cmd.name === "Head") return { ContentLength: size };
    if (cmd.name === "Get") {
      const range = /bytes=0-(\d+)/.exec(String(cmd.input.Range ?? ""));
      const body = range ? bytes.subarray(0, Number(range[1]) + 1) : bytes;
      return {
        Body: (async function* () {
          yield body;
        })(),
      };
    }
    return {};
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("FORM_UPLOADS_BUCKET", "uploads-bucket");
  m.jobFindFirst.mockResolvedValue({ id: "j1", title: "t", description: "d" });
  m.questionFindFirst.mockResolvedValue({ id: "q1" });
  m.fileCount.mockResolvedValue(0);
  m.upCount.mockResolvedValue(0);
  m.upFindMany.mockResolvedValue([]);
  m.fileFindMany.mockResolvedValue([]);
  m.upCreate.mockResolvedValue({});
  m.upDeleteMany.mockResolvedValue({ count: 1 });
  m.upDelete.mockReturnValue("delete-op");
  m.fileCreate.mockImplementation(
    ({ data }: { data: Record<string, unknown> }) => ({
      ...data,
      createdAt: NOW,
      updatedAt: NOW,
      analysis: null,
      analysisEdited: false,
      analysisError: null,
      deletedAt: null,
    }),
  );
  m.transaction.mockImplementation(async (ops: unknown[]) => ops);
  m.refundAiUsage.mockResolvedValue(undefined);
  m.getSignedUrl.mockResolvedValue("https://s3.example/put?sig");
  m.readUpload.mockResolvedValue({
    kind: "PDF",
    mimeType: "application/pdf",
    facts: { kind: "PDF", version: "1.7", pages: 3, title: null },
    sha256: "abc",
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("createJobFileUpload", () => {
  const input = {
    jobId: "j1",
    userId: "u",
    fileName: "Brand deck.pptx",
    size: 60 * MB,
    questionId: "q1",
  };

  it("with a bucket, spends one unit, records the upload and signs a PUT of exactly this size and type, up to 100 MB", async () => {
    const result = await createJobFileUpload(input, NOW);
    expect(result).toMatchObject({
      mode: "s3",
      uploadUrl: "https://s3.example/put?sig",
      headers: { "Content-Type": PPTX_MIME },
      maxBytes: 100 * MB,
    });
    const row = m.upCreate.mock.calls[0][0].data;
    expect(row).toMatchObject({
      jobId: "j1",
      fileName: "Brand deck.pptx",
      kind: "PPTX",
      size: 60 * MB,
      questionId: "q1",
      createdAt: NOW,
    });
    expect(row.storageKey).toBe(`skills/j1/${row.id}`);
    expect(result.mode === "s3" && result.fileId).toBe(row.id);
    expect(m.consumeAiUsage).toHaveBeenCalledWith("u", "skill_analyze", NOW);
    const [, put, options] = m.getSignedUrl.mock.calls[0];
    expect(put.input).toEqual({
      Bucket: "uploads-bucket",
      Key: row.storageKey,
      ContentType: PPTX_MIME,
      ContentLength: 60 * MB,
    });
    expect(options).toEqual({
      expiresIn: 900,
      signableHeaders: new Set(["content-type", "content-length"]),
    });
  });

  it("refuses more than 100 MB, an unsupported name, a foreign task or question, and a full task before spending anything", async () => {
    await expect(
      createJobFileUpload({ ...input, size: 100 * MB + 1 }, NOW),
    ).rejects.toEqual(new FileTooLargeError(100 * MB));
    await expect(
      createJobFileUpload({ ...input, fileName: "macro.pptm" }, NOW),
    ).rejects.toMatchObject({
      code: "UNSUPPORTED_FILE",
      message: FILE_READ_MESSAGES.unsupported,
    });
    m.jobFindFirst.mockResolvedValueOnce(null);
    await expect(createJobFileUpload(input, NOW)).rejects.toBeInstanceOf(
      JobNotFoundError,
    );
    m.questionFindFirst.mockResolvedValueOnce(null);
    await expect(createJobFileUpload(input, NOW)).rejects.toBeInstanceOf(
      QuestionNotFoundError,
    );
    m.fileCount.mockResolvedValueOnce(9);
    m.upCount.mockResolvedValueOnce(1);
    await expect(createJobFileUpload(input, NOW)).rejects.toBeInstanceOf(
      TooManyFilesError,
    );
    expect(m.consumeAiUsage).not.toHaveBeenCalled();
    expect(m.upCreate).not.toHaveBeenCalled();
  });

  it("without a bucket, says to post the file here, up to 20 MB", async () => {
    vi.stubEnv("FORM_UPLOADS_BUCKET", "");
    await expect(
      createJobFileUpload({ ...input, size: 5 * MB }, NOW),
    ).resolves.toEqual({ mode: "direct", maxBytes: 20 * MB });
    await expect(
      createJobFileUpload({ ...input, size: 21 * MB }, NOW),
    ).rejects.toEqual(new FileTooLargeError(20 * MB));
    expect(m.consumeAiUsage).not.toHaveBeenCalled();
  });

  it("records nothing at the daily limit, and hands the unit back when signing fails", async () => {
    m.consumeAiUsage.mockRejectedValueOnce(
      new LimitReachedError("skill_analyze", NOW),
    );
    await expect(createJobFileUpload(input, NOW)).rejects.toBeInstanceOf(
      LimitReachedError,
    );
    expect(m.upCreate).not.toHaveBeenCalled();
    vi.spyOn(console, "error").mockImplementation(() => {});
    m.getSignedUrl.mockRejectedValueOnce(new Error("no creds"));
    await expect(createJobFileUpload(input, NOW)).rejects.toThrow("no creds");
    expect(m.upDeleteMany).toHaveBeenCalledWith({
      where: { id: m.upCreate.mock.calls[0][0].data.id },
    });
    expect(m.refundAiUsage).toHaveBeenCalledWith("u", "skill_analyze", NOW);
  });
});

describe("completeJobFileUpload", () => {
  it("checks the size and the sniffed type, reads the file, and stores it as a pending S3-backed file with the upload's id", async () => {
    m.upFindFirst.mockResolvedValue(upload({ size: 16 }));
    s3Holds(Buffer.concat([PDF_HEAD, Buffer.alloc(8)]));
    m.readUpload.mockImplementation(async (bytes: Uint8Array) => {
      expect(bytes.byteLength).toBe(16);
      return {
        kind: "PDF",
        mimeType: "application/pdf",
        facts: { kind: "PDF", version: "1.7", pages: 3, title: null },
        sha256: "abc",
      };
    });
    const result = await completeJobFileUpload("j1", "u1", "u", NOW);

    expect(result.created).toBe(true);
    expect(result.view).toMatchObject({
      id: "u1",
      kind: "PDF",
      size: 16,
      analysisStatus: "PENDING",
      questionId: "q1",
      bundlable: true,
    });
    expect(commands("Get")[0].input).toEqual({
      Bucket: "uploads-bucket",
      Key: "skills/j1/u1",
      Range: "bytes=0-7",
    });
    const data = m.fileCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({
      id: "u1",
      storageKey: "skills/j1/u1",
      data: null,
      analysisStatus: "PENDING",
      analysisStartedAt: NOW,
    });
    expect(m.transaction).toHaveBeenCalledWith([
      expect.anything(),
      "delete-op",
    ]);
    expect(m.upDelete).toHaveBeenCalledWith({ where: { id: "u1" } });
    expect(m.refundAiUsage).not.toHaveBeenCalled();
  });

  it("answers 'not finished' (and keeps the upload) while the object is missing; S3 says 403 without ListBucket", async () => {
    m.upFindFirst.mockResolvedValue(upload());
    m.send.mockRejectedValue(
      Object.assign(new Error("Forbidden"), {
        $metadata: { httpStatusCode: 403 },
      }),
    );
    await expect(
      completeJobFileUpload("j1", "u1", "u", NOW),
    ).rejects.toBeInstanceOf(UploadNotFinishedError);
    expect(m.upDeleteMany).not.toHaveBeenCalled();
  });

  it("abandons an object of the wrong size, refunding the unit and trying to delete it", async () => {
    m.upFindFirst.mockResolvedValue(upload());
    s3Holds(PDF_HEAD, 10);
    await expect(
      completeJobFileUpload("j1", "u1", "u", NOW),
    ).rejects.toBeInstanceOf(UploadSizeMismatchError);
    expect(m.upDeleteMany).toHaveBeenCalledWith({ where: { id: "u1" } });
    expect(m.refundAiUsage).toHaveBeenCalledWith(
      "u",
      "skill_analyze",
      minutesAgo(2),
    );
    expect(commands("Delete")[0].input).toEqual({
      Bucket: "uploads-bucket",
      Key: "skills/j1/u1",
    });
  });

  it("refuses a file whose first bytes don't match its name, or are an encrypted Office file, without reading it all", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    m.upFindFirst.mockResolvedValue(
      upload({ fileName: "deck.pptx", kind: "PPTX", size: 16 }),
    );
    s3Holds(Buffer.concat([PDF_HEAD, Buffer.alloc(8)]));
    await expect(
      completeJobFileUpload("j1", "u1", "u", NOW),
    ).rejects.toMatchObject({
      code: "UNSUPPORTED_FILE",
      message: FILE_READ_MESSAGES.mismatch,
    });
    s3Holds(
      Buffer.from([
        0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0, 0, 0, 0, 0,
      ]),
    );
    await expect(
      completeJobFileUpload("j1", "u1", "u", NOW),
    ).rejects.toMatchObject({
      code: "FILE_ENCRYPTED",
      message: FILE_READ_MESSAGES.ole,
    });
    expect(m.readUpload).not.toHaveBeenCalled();
    expect(m.refundAiUsage).toHaveBeenCalledTimes(2);
    expect(m.fileCreate).not.toHaveBeenCalled();
  });

  it("refuses what the full read refuses (a macro file), with the same error, and hands the unit back", async () => {
    m.upFindFirst.mockResolvedValue(
      upload({ fileName: "deck.pptx", kind: "PPTX", size: 16 }),
    );
    s3Holds(
      Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(12)]),
    );
    const { FileReadError } = await import("../files/types");
    m.readUpload.mockRejectedValue(
      new FileReadError("UNSUPPORTED_FILE", FILE_READ_MESSAGES.macro),
    );
    await expect(
      completeJobFileUpload("j1", "u1", "u", NOW),
    ).rejects.toMatchObject({ message: FILE_READ_MESSAGES.macro });
    expect(m.refundAiUsage).toHaveBeenCalledTimes(1);
  });

  it("abandons an upload completed after 30 minutes", async () => {
    m.upFindFirst.mockResolvedValue(upload({ createdAt: minutesAgo(31) }));
    await expect(
      completeJobFileUpload("j1", "u1", "u", NOW),
    ).rejects.toBeInstanceOf(UploadExpiredError);
    expect(m.refundAiUsage).toHaveBeenCalledWith(
      "u",
      "skill_analyze",
      minutesAgo(31),
    );
  });

  it("answers an already completed upload with its file (a retried request), and 404s anything else", async () => {
    m.upFindFirst.mockResolvedValue(null);
    m.fileFindFirst.mockResolvedValueOnce({
      ...upload(),
      assetName: "brand.pdf",
      analysisStatus: "PENDING",
      analysisStartedAt: NOW,
      analysis: null,
      analysisEdited: false,
      analysisError: null,
    });
    expect((await completeJobFileUpload("j1", "u1", "u", NOW)).created).toBe(
      false,
    );
    m.fileFindFirst.mockResolvedValueOnce(null);
    await expect(
      completeJobFileUpload("j1", "u1", "u", NOW),
    ).rejects.toMatchObject({ name: "FileNotFoundError" });
  });

  it("refuses a cut-off read of the whole object and keeps the upload to complete again", async () => {
    m.upFindFirst.mockResolvedValue(upload({ size: 16 }));
    s3Holds(Buffer.concat([PDF_HEAD, Buffer.alloc(4)]), 16);
    await expect(completeJobFileUpload("j1", "u1", "u", NOW)).rejects.toThrow(
      "shorter than expected",
    );
    expect(m.upDeleteMany).not.toHaveBeenCalled();
    expect(m.fileCreate).not.toHaveBeenCalled();
  });

  it("keeps a file whose question was removed meanwhile as a general file", async () => {
    m.upFindFirst.mockResolvedValue(upload({ size: 16 }));
    s3Holds(Buffer.concat([PDF_HEAD, Buffer.alloc(8)]));
    m.questionFindFirst.mockResolvedValue(null);
    const result = await completeJobFileUpload("j1", "u1", "u", NOW);
    expect(result.view.questionId).toBeNull();
  });
});

describe("sweepAbandonedUploads", () => {
  it("removes the user's uploads older than 30 minutes, refunding each once", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    m.upFindMany.mockResolvedValue([
      upload({ id: "a", createdAt: minutesAgo(40) }),
      upload({ id: "b", storageKey: "skills/j1/b", createdAt: minutesAgo(31) }),
    ]);
    // "b" was already cleaned up by another request: no second refund.
    m.upDeleteMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    // The production role has no s3:DeleteObject: the failure is tolerated.
    m.send.mockRejectedValue(
      Object.assign(new Error("denied"), { name: "AccessDenied" }),
    );
    expect(await sweepAbandonedUploads("u", NOW)).toBe(2);
    expect(m.upFindMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: minutesAgo(30) }, job: { userId: "u" } },
      take: 50,
    });
    expect(m.refundAiUsage).toHaveBeenCalledTimes(1);
    expect(m.refundAiUsage).toHaveBeenCalledWith(
      "u",
      "skill_analyze",
      minutesAgo(40),
    );
    expect(console.error).toHaveBeenCalledWith(
      "[skills-builder] could not delete a stored file:",
      "AccessDenied",
    );
  });
});
