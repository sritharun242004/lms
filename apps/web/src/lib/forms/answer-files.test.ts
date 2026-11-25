import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { create, findUnique, getSignedUrl } = vi.hoisted(() => ({
  create: vi.fn(),
  findUnique: vi.fn(),
  getSignedUrl: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { formAnswerFile: { create, findUnique } } }));
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl }));

import {
  MAX_DATABASE_ANSWER_FILE_BYTES,
  MAX_S3_ANSWER_FILE_BYTES,
  createAnswerFileUpload,
  getAnswerFileDownload,
  storeAnswerFile,
} from "./answer-files";

const MB = 1024 * 1024;

beforeEach(() => {
  create.mockReset();
  findUnique.mockReset();
  getSignedUrl.mockReset();
  vi.unstubAllEnvs();
});
afterEach(() => vi.unstubAllEnvs());

describe("storeAnswerFile (no S3: bytes in the database)", () => {
  it("rejects a file over the database limit", async () => {
    await expect(
      storeAnswerFile({ mimeType: "image/png", fileName: "x.png", size: MAX_DATABASE_ANSWER_FILE_BYTES + 1, data: Buffer.alloc(1) })
    ).rejects.toThrow(/20 MB/);
  });

  it("stores the file and returns its id", async () => {
    create.mockResolvedValue({ id: "file1", fileName: "resume.pdf" });
    const result = await storeAnswerFile({ mimeType: "application/pdf", fileName: "resume.pdf", size: 10, data: Buffer.alloc(10) });
    expect(result).toEqual({ fileId: "file1", fileName: "resume.pdf" });
  });
});

describe("createAnswerFileUpload", () => {
  it("without a bucket, tells the browser to post the file here, up to 20 MB", async () => {
    await expect(createAnswerFileUpload({ fileName: "a.pdf", mimeType: "application/pdf", size: 5 * MB })).resolves.toEqual({
      mode: "direct",
      maxBytes: MAX_DATABASE_ANSWER_FILE_BYTES,
    });
    await expect(createAnswerFileUpload({ fileName: "a.mp4", mimeType: "video/mp4", size: 50 * MB })).rejects.toThrow(/20 MB/);
    expect(create).not.toHaveBeenCalled();
  });

  it("with a bucket, records the file and signs an upload of exactly that size and type, up to 100 MB", async () => {
    vi.stubEnv("FORM_UPLOADS_BUCKET", "cms-form-uploads");
    create.mockResolvedValue({ id: "file1" });
    getSignedUrl.mockResolvedValue("https://s3.example/put");

    const upload = await createAnswerFileUpload({ fileName: "talk.mp4", mimeType: "video/mp4", size: 95 * MB });

    expect(upload).toEqual({
      mode: "s3",
      fileId: "file1",
      uploadUrl: "https://s3.example/put",
      headers: { "Content-Type": "video/mp4" },
      maxBytes: MAX_S3_ANSWER_FILE_BYTES,
    });
    const row = create.mock.calls[0][0].data;
    expect(row).toMatchObject({ fileName: "talk.mp4", mimeType: "video/mp4", size: 95 * MB });
    expect(row.storageKey).toMatch(/^form-answers\/[0-9a-f-]{36}$/);
    expect(row).not.toHaveProperty("data");
    const [, command, options] = getSignedUrl.mock.calls[0];
    expect(command.input).toMatchObject({ Bucket: "cms-form-uploads", Key: row.storageKey, ContentType: "video/mp4", ContentLength: 95 * MB });
    expect([...options.signableHeaders]).toEqual(["content-type", "content-length"]);
  });

  it("rejects anything over 100 MB, and empty files", async () => {
    vi.stubEnv("FORM_UPLOADS_BUCKET", "cms-form-uploads");
    await expect(createAnswerFileUpload({ fileName: "big.mov", mimeType: "video/quicktime", size: 100 * MB + 1 })).rejects.toThrow(/100 MB/);
    await expect(createAnswerFileUpload({ fileName: "empty.txt", mimeType: "text/plain", size: 0 })).rejects.toMatchObject({ code: "FILE_REQUIRED" });
    expect(create).not.toHaveBeenCalled();
  });

  it("keeps a file name from carrying a path", async () => {
    vi.stubEnv("FORM_UPLOADS_BUCKET", "cms-form-uploads");
    create.mockResolvedValue({ id: "file1" });
    getSignedUrl.mockResolvedValue("https://s3.example/put");
    await createAnswerFileUpload({ fileName: "../../etc/passwd", mimeType: "", size: 10 });
    expect(create.mock.calls[0][0].data).toMatchObject({ fileName: ".._.._etc_passwd", mimeType: "application/octet-stream" });
  });
});

describe("getAnswerFileDownload", () => {
  it("signs a short-lived S3 link with safe download headers", async () => {
    vi.stubEnv("FORM_UPLOADS_BUCKET", "cms-form-uploads");
    findUnique.mockResolvedValue({ id: "f", fileName: "page.html", mimeType: "text/html", size: 5, storageKey: "form-answers/k", data: null });
    getSignedUrl.mockResolvedValue("https://s3.example/get");

    await expect(getAnswerFileDownload("f")).resolves.toEqual({ kind: "redirect", url: "https://s3.example/get" });
    const [, command, options] = getSignedUrl.mock.calls[0];
    expect(command.input).toMatchObject({ Key: "form-answers/k", ResponseContentType: "application/octet-stream" });
    expect(command.input.ResponseContentDisposition).toMatch(/^attachment;/);
    expect(options.expiresIn).toBe(300);
  });

  it("serves an older database-stored file directly", async () => {
    findUnique.mockResolvedValue({ id: "f", fileName: "a.png", mimeType: "image/png", size: 3, storageKey: null, data: Buffer.from([1, 2, 3]) });
    const download = await getAnswerFileDownload("f");
    expect(download?.kind).toBe("bytes");
  });

  it("says plainly when an S3 file exists but this server has no bucket configured", async () => {
    findUnique.mockResolvedValue({ id: "f", fileName: "a.mp4", mimeType: "video/mp4", size: 3, storageKey: "form-answers/k", data: null });
    await expect(getAnswerFileDownload("f")).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE", status: 503 });
  });
});
