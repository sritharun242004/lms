import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getPublicForm, isPublicFileUploadQuestion, createAnswerFileUpload, maxAnswerFileBytes } = vi.hoisted(() => ({
  getPublicForm: vi.fn(),
  isPublicFileUploadQuestion: vi.fn(),
  createAnswerFileUpload: vi.fn(),
  maxAnswerFileBytes: vi.fn(() => 100 * 1024 * 1024),
}));
vi.mock("@/lib/forms/responses", () => ({ getPublicForm, isPublicFileUploadQuestion }));
vi.mock("@/lib/forms/answer-files", () => ({ createAnswerFileUpload, maxAnswerFileBytes }));

import { GET, POST } from "./route";
import { resetRateLimitsForTests } from "@/lib/api/rate-limit";
import { FormError } from "@/lib/forms/form-service";

const context = { params: Promise.resolve({ id: "f1" }) };
const publicForm = { sections: [{ questions: [{ id: "q9", type: "FILE_UPLOAD" }] }] };

function post(body: unknown, ip = "1.2.3.4") {
  return POST(
    new NextRequest("http://localhost/api/v1/public/forms/f1/answer-files/upload-url", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    }),
    context
  );
}

beforeEach(() => {
  getPublicForm.mockReset();
  isPublicFileUploadQuestion.mockReset();
  createAnswerFileUpload.mockReset();
  resetRateLimitsForTests();
});

describe("GET /api/v1/public/forms/[id]/answer-files/upload-url", () => {
  it("returns the max size for a genuinely public form", async () => {
    getPublicForm.mockResolvedValue(publicForm);
    const res = await GET(new NextRequest("http://localhost"), context);
    expect(res.status).toBe(200);
    expect((await res.json()).data.maxBytes).toBe(100 * 1024 * 1024);
  });

  it("passes on the form's own not-found error", async () => {
    getPublicForm.mockRejectedValue(new FormError("This form isn't available", "NOT_FOUND", 404));
    const res = await GET(new NextRequest("http://localhost"), context);
    expect(res.status).toBe(404);
  });
});

describe("POST /api/v1/public/forms/[id]/answer-files/upload-url", () => {
  it("starts an upload for a real FILE_UPLOAD question on the form", async () => {
    getPublicForm.mockResolvedValue(publicForm);
    isPublicFileUploadQuestion.mockReturnValue(true);
    createAnswerFileUpload.mockResolvedValue({ mode: "direct", maxBytes: 100 * 1024 * 1024 });

    const res = await post({ fileName: "a.pdf", mimeType: "application/pdf", size: 10, questionId: "q9" });
    expect(res.status).toBe(200);
    expect(createAnswerFileUpload).toHaveBeenCalledWith({ fileName: "a.pdf", mimeType: "application/pdf", size: 10 });
  });

  it("refuses a questionId that isn't a file-upload question on this form", async () => {
    getPublicForm.mockResolvedValue(publicForm);
    isPublicFileUploadQuestion.mockReturnValue(false);

    const res = await post({ fileName: "a.pdf", mimeType: "application/pdf", size: 10, questionId: "not-a-file-question" });
    expect(res.status).toBe(400);
    expect(createAnswerFileUpload).not.toHaveBeenCalled();
  });

  it("rejects malformed bodies", async () => {
    expect((await post({ fileName: "a.pdf" })).status).toBe(400);
    expect((await post("not json")).status).toBe(400);
    expect(getPublicForm).not.toHaveBeenCalled();
  });

  it("slows down a flood from one address", async () => {
    getPublicForm.mockResolvedValue(publicForm);
    isPublicFileUploadQuestion.mockReturnValue(true);
    createAnswerFileUpload.mockResolvedValue({ mode: "direct", maxBytes: 1 });

    let last = 0;
    for (let i = 0; i < 121; i += 1) {
      last = (await post({ fileName: "a.pdf", mimeType: "application/pdf", size: 10, questionId: "q9" }, "9.9.9.9")).status;
    }
    expect(last).toBe(429);
    expect((await post({ fileName: "a.pdf", mimeType: "application/pdf", size: 10, questionId: "q9" }, "8.8.8.8")).status).toBe(200);
  });
});
