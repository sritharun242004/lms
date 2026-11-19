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

import { getFormForFilling, submitFormResponse } from "./responses";

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
