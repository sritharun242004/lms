import { describe, expect, it, vi, beforeEach } from "vitest";
import { validateAnswerValue } from "./responses";

const { formFindUnique, responseFindFirst, invitationFindUnique, invitationUpdate, responseCreate } = vi.hoisted(() => ({
  formFindUnique: vi.fn(),
  responseFindFirst: vi.fn(),
  invitationFindUnique: vi.fn(),
  invitationUpdate: vi.fn(),
  responseCreate: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    form: { findUnique: formFindUnique },
    formResponse: { findFirst: responseFindFirst, create: responseCreate },
    formInvitation: { findUnique: invitationFindUnique, update: invitationUpdate },
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({
        formResponse: { create: responseCreate },
        formInvitation: { update: invitationUpdate },
      }),
  },
}));

import {
  getFormForFilling,
  getPublicForm,
  isPublicFileUploadQuestion,
  submitFormResponse,
  submitPublicFormResponse,
} from "./responses";

beforeEach(() => {
  formFindUnique.mockReset();
  responseFindFirst.mockReset();
  invitationFindUnique.mockReset();
  invitationUpdate.mockReset();
  responseCreate.mockReset();
});

describe("validateAnswerValue", () => {
  it("accepts a short answer under the character limit", () => {
    expect(validateAnswerValue({ id: "q1", type: "SHORT_ANSWER", required: false, config: { maxLength: 10 } }, "hello")).toBeNull();
  });

  it("rejects a short answer over the character limit", () => {
    expect(validateAnswerValue({ id: "q1", type: "SHORT_ANSWER", required: false, config: { maxLength: 3 } }, "hello")).toMatch(/limit/);
  });

  it("rejects a multiple-choice value not in the options", () => {
    expect(
      validateAnswerValue({ id: "q1", type: "MULTIPLE_CHOICE", required: false, config: { options: ["A", "B"] } }, "C")
    ).toMatch(/not one of/i);
  });

  it("rejects checkboxes below the minimum selections", () => {
    expect(
      validateAnswerValue(
        { id: "q1", type: "CHECKBOXES", required: false, config: { options: ["A", "B", "C"], minSelections: 2 } },
        ["A"]
      )
    ).toMatch(/at least/i);
  });

  it("rejects a star rating outside its range", () => {
    expect(validateAnswerValue({ id: "q1", type: "STAR_RATING", required: false, config: {} }, 7)).toMatch(/between/i);
  });

  it("accepts a valid multiple-choice grid answer", () => {
    expect(
      validateAnswerValue(
        { id: "q1", type: "MULTIPLE_CHOICE_GRID", required: false, config: { rows: ["Row1"], columns: ["Good", "Bad"] } },
        { Row1: "Good" }
      )
    ).toBeNull();
  });
});

describe("getFormForFilling", () => {
  it("rejects a non-staff viewer when the form is still a draft", async () => {
    formFindUnique.mockResolvedValue({ id: "f1", status: "DRAFT", createdById: "staff1", sections: [] });
    await expect(getFormForFilling({ id: "mentee1", role: "MENTEE" }, "f1")).rejects.toThrow(/not open/i);
  });

  it("allows the form's own creator to view it while still a draft", async () => {
    formFindUnique.mockResolvedValue({ id: "f1", status: "DRAFT", createdById: "staff1", sections: [] });
    await expect(getFormForFilling({ id: "staff1", role: "MENTOR" }, "f1")).resolves.toBeTruthy();
  });
});

describe("submitFormResponse", () => {
  const publishedForm = {
    id: "f1",
    status: "PUBLISHED",
    createdById: "staff1",
    allowMultipleSubmissions: false,
    opensAt: null,
    closesAt: null,
    sections: [
      {
        questions: [
          { id: "q1", type: "SHORT_ANSWER", required: true, title: "Your name", config: {} },
        ],
      },
    ],
  };

  it("rejects when a required question is left unanswered", async () => {
    formFindUnique.mockResolvedValue(publishedForm);
    await expect(
      submitFormResponse({ id: "u1", role: "MENTEE" }, "f1", { answers: [] })
    ).rejects.toThrow(/required/i);
  });

  it("rejects a duplicate submission when multiple submissions are not allowed", async () => {
    formFindUnique.mockResolvedValue(publishedForm);
    responseFindFirst.mockResolvedValue({ id: "existing-response" });
    await expect(
      submitFormResponse({ id: "u1", role: "MENTEE" }, "f1", { answers: [{ questionId: "q1", value: "Asha" }] })
    ).rejects.toThrow(/already submitted/i);
  });

  it("creates a response and marks the invitation submitted", async () => {
    formFindUnique.mockResolvedValue(publishedForm);
    responseFindFirst.mockResolvedValue(null);
    invitationFindUnique.mockResolvedValue({ id: "inv1", recipientUserId: "u1", response: null });
    responseCreate.mockResolvedValue({ id: "r1", answers: [] });

    const response = await submitFormResponse(
      { id: "u1", role: "MENTEE" },
      "f1",
      { invitationId: "inv1", answers: [{ questionId: "q1", value: "Asha" }] }
    );

    expect(responseCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ formId: "f1", invitationId: "inv1", respondentUserId: "u1" }) })
    );
    expect(invitationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "inv1" }, data: expect.objectContaining({ status: "SUBMITTED" }) })
    );
    expect(response.id).toBe("r1");
  });

  it("rejects an invitation addressed to someone else", async () => {
    formFindUnique.mockResolvedValue(publishedForm);
    responseFindFirst.mockResolvedValue(null);
    invitationFindUnique.mockResolvedValue({ id: "inv1", recipientUserId: "someone-else", response: null });
    await expect(
      submitFormResponse(
        { id: "u1", role: "MENTEE" },
        "f1",
        { invitationId: "inv1", answers: [{ questionId: "q1", value: "Asha" }] }
      )
    ).rejects.toThrow(/not addressed to you/i);
  });
});

describe("short answer email format", () => {
  const email = { id: "q1", type: "SHORT_ANSWER" as const, required: true, config: { format: "email" } };

  it("accepts an email address", () => {
    expect(validateAnswerValue(email, "asha@example.com")).toBeNull();
  });

  it("rejects text that is not an email address", () => {
    expect(validateAnswerValue(email, "asha at example")).toMatch(/email/i);
  });
});

describe("public form link", () => {
  const publicForm = {
    id: "f1",
    status: "PUBLISHED",
    publicLinkEnabled: true,
    isTemplate: false,
    opensAt: null,
    closesAt: null,
    sections: [{ questions: [{ id: "q1", type: "SHORT_ANSWER", title: "Name", required: true, config: {} }] }],
  };

  it("serves a published form with its public link switched on", async () => {
    formFindUnique.mockResolvedValue(publicForm);
    await expect(getPublicForm("f1")).resolves.toMatchObject({ id: "f1" });
  });

  it.each([
    ["missing", null],
    ["a draft", { ...publicForm, status: "DRAFT" }],
    ["link switched off", { ...publicForm, publicLinkEnabled: false }],
    ["a template", { ...publicForm, isTemplate: true }],
    ["closed", { ...publicForm, closesAt: new Date("2020-01-01") }],
  ])("reports %s the same way, as not found", async (_label, form) => {
    formFindUnique.mockResolvedValue(form);
    await expect(getPublicForm("f1")).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
  });

  it("saves an anonymous response with no respondent", async () => {
    formFindUnique.mockResolvedValue(publicForm);
    responseCreate.mockResolvedValue({ id: "r1" });
    await submitPublicFormResponse("f1", [{ questionId: "q1", value: "Asha" }]);
    expect(responseCreate.mock.calls[0][0].data).toMatchObject({ formId: "f1", respondentUserId: null, anonymous: true });
  });

  it("still enforces required answers", async () => {
    formFindUnique.mockResolvedValue(publicForm);
    await expect(submitPublicFormResponse("f1", [])).rejects.toThrow(/required/i);
    expect(responseCreate).not.toHaveBeenCalled();
  });

  it("accepts a required file upload answer on a public form", async () => {
    formFindUnique.mockResolvedValue({
      ...publicForm,
      sections: [{ questions: [{ id: "q9", type: "FILE_UPLOAD", title: "CV", required: true, config: {} }] }],
    });
    responseCreate.mockResolvedValue({ id: "r1" });
    await submitPublicFormResponse("f1", [{ questionId: "q9", value: { fileId: "f-abc" } }]);
    expect(responseCreate.mock.calls[0][0].data.answers.create).toEqual([
      { questionId: "q9", value: { fileId: "f-abc" } },
    ]);
  });

  it("still rejects a required file upload left unanswered", async () => {
    formFindUnique.mockResolvedValue({
      ...publicForm,
      sections: [{ questions: [{ id: "q9", type: "FILE_UPLOAD", title: "CV", required: true, config: {} }] }],
    });
    await expect(submitPublicFormResponse("f1", [])).rejects.toThrow(/required/i);
  });

  it("accepts an optional file upload left out, and the rest of the answers", async () => {
    formFindUnique.mockResolvedValue({
      ...publicForm,
      sections: [
        {
          questions: [
            { id: "q1", type: "SHORT_ANSWER", title: "Name", required: true, config: {} },
            { id: "q9", type: "FILE_UPLOAD", title: "Photo", required: false, config: {} },
          ],
        },
      ],
    });
    responseCreate.mockResolvedValue({ id: "r1" });
    await submitPublicFormResponse("f1", [{ questionId: "q1", value: "Asha" }]);
    expect(responseCreate).toHaveBeenCalled();
  });
});

describe("isPublicFileUploadQuestion", () => {
  const form = {
    sections: [
      {
        questions: [
          { id: "q1", type: "SHORT_ANSWER" as const },
          { id: "q9", type: "FILE_UPLOAD" as const },
        ],
      },
    ],
  };

  it("accepts a real FILE_UPLOAD question on the form", () => {
    expect(isPublicFileUploadQuestion(form, "q9")).toBe(true);
  });

  it("rejects a question that exists but is not a file upload", () => {
    expect(isPublicFileUploadQuestion(form, "q1")).toBe(false);
  });

  it("rejects a question id that isn't on the form at all", () => {
    expect(isPublicFileUploadQuestion(form, "nope")).toBe(false);
  });
});
