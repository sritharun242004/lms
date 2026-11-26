import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  isAiConfigured: vi.fn(),
  after: vi.fn(),
  createJobFileUpload: vi.fn(),
  completeJobFileUpload: vi.fn(),
  runFileAnalysis: vi.fn(),
}));
vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: mocks.after,
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/ai/config", async (orig) => ({
  ...(await orig<typeof import("@/lib/ai/config")>()),
  isAiConfigured: mocks.isAiConfigured,
}));
vi.mock("@/lib/ai/claude", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/skills/jobs/uploads", () => ({
  createJobFileUpload: mocks.createJobFileUpload,
  completeJobFileUpload: mocks.completeJobFileUpload,
}));
vi.mock("@/lib/skills/jobs/files", () => ({
  runFileAnalysis: mocks.runFileAnalysis,
}));

import {
  FileTooLargeError,
  JobNotFoundError,
  UploadNotFinishedError,
} from "@/lib/skills/jobs/errors";
import * as complete from "./[id]/files/[fileId]/complete/route";
import * as uploadUrl from "./[id]/files/upload-url/route";

const ctx = { params: Promise.resolve({ id: "j1" }) };
const fileCtx = { params: Promise.resolve({ id: "j1", fileId: "u1" }) };
const post = (body?: unknown) =>
  new NextRequest("http://localhost/x", {
    method: "POST",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const MB = 1024 * 1024;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "u", role: "USER" });
  mocks.isAiConfigured.mockReturnValue(true);
});

describe("POST /skill-jobs/:id/files/upload-url", () => {
  it("passes the declared file on and answers 201 with the signed link", async () => {
    const target = {
      mode: "s3",
      fileId: "u1",
      uploadUrl: "https://s3/put",
      headers: { "Content-Type": "application/pdf" },
      maxBytes: 100 * MB,
    };
    mocks.createJobFileUpload.mockResolvedValue(target);
    const res = await uploadUrl.POST(
      post({ name: "C:\\decks\\Brand.pdf", size: 60 * MB, questionId: "q1" }),
      ctx,
    );
    expect(res.status).toBe(201);
    expect((await res.json()).data).toEqual(target);
    expect(mocks.createJobFileUpload).toHaveBeenCalledWith({
      jobId: "j1",
      userId: "u",
      fileName: "Brand.pdf",
      size: 60 * MB,
      questionId: "q1",
    });
  });

  it("answers 200 'post it here' without a bucket", async () => {
    mocks.createJobFileUpload.mockResolvedValue({
      mode: "direct",
      maxBytes: 20 * MB,
    });
    expect(
      (await uploadUrl.POST(post({ name: "a.pdf", size: 10 }), ctx)).status,
    ).toBe(200);
  });

  it("validates the name and size before anything runs", async () => {
    expect((await uploadUrl.POST(post({ size: 10 }), ctx)).status).toBe(400);
    expect((await uploadUrl.POST(post({ name: "a.pdf" }), ctx)).status).toBe(
      400,
    );
    expect(
      (await uploadUrl.POST(post({ name: "a.pdf", size: 1.5 }), ctx)).status,
    ).toBe(400);
    const empty = await uploadUrl.POST(post({ name: "a.pdf", size: 0 }), ctx);
    expect((await empty.json()).error.message).toBe("This file is empty.");
    expect(mocks.createJobFileUpload).not.toHaveBeenCalled();
  });

  it("maps a too-large file to 413 'Files can be up to 100 MB.' and a foreign task to 404", async () => {
    mocks.createJobFileUpload.mockRejectedValueOnce(
      new FileTooLargeError(100 * MB),
    );
    const big = await uploadUrl.POST(
      post({ name: "a.pdf", size: 101 * MB }),
      ctx,
    );
    expect(big.status).toBe(413);
    expect((await big.json()).error).toMatchObject({
      code: "FILE_TOO_LARGE",
      message: "Files can be up to 100 MB.",
    });
    mocks.createJobFileUpload.mockRejectedValueOnce(new JobNotFoundError());
    expect(
      (await uploadUrl.POST(post({ name: "a.pdf", size: 10 }), ctx)).status,
    ).toBe(404);
  });

  it("refuses signed-out callers and a server without AI", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);
    expect(
      (await uploadUrl.POST(post({ name: "a.pdf", size: 10 }), ctx)).status,
    ).toBe(401);
    mocks.isAiConfigured.mockReturnValueOnce(false);
    expect(
      (await uploadUrl.POST(post({ name: "a.pdf", size: 10 }), ctx)).status,
    ).toBe(503);
  });
});

describe("POST /skill-jobs/:id/files/:fileId/complete", () => {
  it("stores the file (201) and starts its analysis after the response", async () => {
    mocks.completeJobFileUpload.mockResolvedValue({
      view: { id: "u1" },
      created: true,
    });
    const res = await complete.POST(post(), fileCtx);
    expect(res.status).toBe(201);
    expect(mocks.completeJobFileUpload).toHaveBeenCalledWith("j1", "u1", "u");
    expect(mocks.after).toHaveBeenCalledTimes(1);
    await mocks.after.mock.calls[0][0]();
    expect(mocks.runFileAnalysis).toHaveBeenCalledWith("j1", "u1", "u");
  });

  it("answers a repeated complete with the file, without a second analysis", async () => {
    mocks.completeJobFileUpload.mockResolvedValue({
      view: { id: "u1" },
      created: false,
    });
    expect((await complete.POST(post(), fileCtx)).status).toBe(200);
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("answers 409 while the bytes have not arrived", async () => {
    mocks.completeJobFileUpload.mockRejectedValue(new UploadNotFinishedError());
    const res = await complete.POST(post(), fileCtx);
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("UPLOAD_INCOMPLETE");
  });
});
