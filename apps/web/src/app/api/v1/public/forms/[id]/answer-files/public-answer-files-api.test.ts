import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getPublicForm, isPublicFileUploadQuestion, storeAnswerFile } = vi.hoisted(() => ({
  getPublicForm: vi.fn(),
  isPublicFileUploadQuestion: vi.fn(),
  storeAnswerFile: vi.fn(),
}));
vi.mock("@/lib/forms/responses", () => ({ getPublicForm, isPublicFileUploadQuestion }));
vi.mock("@/lib/forms/answer-files", () => ({ storeAnswerFile }));

import { POST } from "./route";
import { resetRateLimitsForTests } from "@/lib/api/rate-limit";

const context = { params: Promise.resolve({ id: "f1" }) };
const publicForm = { sections: [{ questions: [{ id: "q9", type: "FILE_UPLOAD" }] }] };

function postForm(data: FormData, ip = "1.2.3.4") {
  return POST(
    new NextRequest("http://localhost/api/v1/public/forms/f1/answer-files", {
      method: "POST",
      body: data,
      headers: { "x-forwarded-for": ip },
    }),
    context
  );
}

beforeEach(() => {
  getPublicForm.mockReset();
  isPublicFileUploadQuestion.mockReset();
  storeAnswerFile.mockReset();
  resetRateLimitsForTests();
});

describe("POST /api/v1/public/forms/[id]/answer-files", () => {
  it("stores a file posted for a real FILE_UPLOAD question on the form", async () => {
    getPublicForm.mockResolvedValue(publicForm);
    isPublicFileUploadQuestion.mockReturnValue(true);
    storeAnswerFile.mockResolvedValue({ fileId: "file1", fileName: "resume.pdf" });

    const data = new FormData();
    data.append("file", new File(["hi"], "resume.pdf", { type: "application/pdf" }));
    data.append("questionId", "q9");

    const res = await postForm(data);
    expect(res.status).toBe(201);
    expect(storeAnswerFile).toHaveBeenCalled();
  });

  it("refuses a questionId that isn't a file-upload question on this form", async () => {
    getPublicForm.mockResolvedValue(publicForm);
    isPublicFileUploadQuestion.mockReturnValue(false);

    const data = new FormData();
    data.append("file", new File(["hi"], "resume.pdf", { type: "application/pdf" }));
    data.append("questionId", "not-a-file-question");

    const res = await postForm(data);
    expect(res.status).toBe(400);
    expect(storeAnswerFile).not.toHaveBeenCalled();
  });

  it("rejects a request with no file or no questionId", async () => {
    const noFile = new FormData();
    noFile.append("questionId", "q9");
    expect((await postForm(noFile)).status).toBe(400);

    const noQuestion = new FormData();
    noQuestion.append("file", new File(["hi"], "resume.pdf", { type: "application/pdf" }));
    expect((await postForm(noQuestion)).status).toBe(400);
    expect(getPublicForm).not.toHaveBeenCalled();
  });

  it("slows down a flood from one address", async () => {
    getPublicForm.mockResolvedValue(publicForm);
    isPublicFileUploadQuestion.mockReturnValue(true);
    storeAnswerFile.mockResolvedValue({ fileId: "file1", fileName: "resume.pdf" });

    const makeData = () => {
      const data = new FormData();
      data.append("file", new File(["hi"], "resume.pdf", { type: "application/pdf" }));
      data.append("questionId", "q9");
      return data;
    };

    let last = 0;
    for (let i = 0; i < 121; i += 1) last = (await postForm(makeData(), "9.9.9.9")).status;
    expect(last).toBe(429);
    expect((await postForm(makeData(), "8.8.8.8")).status).toBe(201);
  });
});
