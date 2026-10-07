import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  findMany: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  deleteItem: vi.fn(),
  deleteOptions: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    questionLibraryItem: {
      findMany: mocks.findMany,
      findUnique: mocks.findUnique,
      create: mocks.create,
      delete: mocks.deleteItem,
    },
    questionLibraryOption: { deleteMany: mocks.deleteOptions },
    $transaction: mocks.transaction,
  },
}));

import { GET, POST, PUT } from "./route";
import * as itemRoute from "./[id]/route";

const quizRow = {
  id: "quiz-1",
  name: "Legacy quiz",
  question: "Choose one",
  type: "MULTIPLE_CHOICE",
  chartType: "BAR",
  options: [{ text: "One", order: 0 }, { text: "Two", order: 1 }],
  createdBy: { name: "Coach" },
};

function jsonRequest(body: unknown) {
  return new NextRequest("http://localhost/api/v1/questions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "coach-1", role: "MENTOR" });
  mocks.findMany.mockResolvedValue([quizRow]);
  mocks.create.mockImplementation(async ({ data }) => ({
    id: "created-1",
    ...data,
    options: data.options?.create ?? [],
    createdBy: { name: "Coach" },
  }));
  mocks.findUnique.mockResolvedValue({
    id: "question-1",
    name: "Reflection",
    question: "What changed?",
    type: "WORD_CLOUD",
    chartType: "BAR",
    options: [],
    createdBy: { name: "Coach" },
  });
  mocks.update.mockImplementation(async ({ data }) => ({
    id: "question-1",
    chartType: "BAR",
    options: [],
    createdBy: { name: "Coach" },
    ...data,
  }));
  mocks.deleteItem.mockResolvedValue({ id: "question-1" });
  mocks.deleteOptions.mockResolvedValue({ count: 0 });
  mocks.transaction.mockImplementation(async (callback) => callback({
    questionLibraryItem: { update: mocks.update },
    questionLibraryOption: { deleteMany: mocks.deleteOptions },
  }));
});

describe("question library collection route", () => {
  it("keeps an omitted type backward-compatible with MULTIPLE_CHOICE quiz creation", async () => {
    const response = await POST(jsonRequest({
      name: "Legacy quiz",
      question: "Choose one",
      options: ["One", "Two"],
      chartType: "BAR",
    }));

    expect(response.status).toBe(201);
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({
      name: "Legacy quiz",
      question: "Choose one",
      type: "MULTIPLE_CHOICE",
      chartType: "BAR",
    });
    expect(mocks.create.mock.calls[0][0].data.options.create).toEqual([
      { text: "One", order: 0 },
      { text: "Two", order: 1 },
    ]);
  });

  it.each(["WORD_CLOUD", "OPEN_ENDED"] as const)("creates and persists a %s template without options", async (type) => {
    const response = await POST(jsonRequest({ name: "Reflection", question: "What changed?", type }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data.item.type).toBe(type);
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({
      name: "Reflection",
      question: "What changed?",
      type,
    });
    expect(mocks.create.mock.calls[0][0].data.options).toBeUndefined();
  });

  it("filters the compatible default list to quizzes and the questions tab to standalone types", async () => {
    await GET(new NextRequest("http://localhost/api/v1/questions"));
    expect(mocks.findMany.mock.calls[0][0].where).toEqual({ type: "MULTIPLE_CHOICE" });

    await GET(new NextRequest("http://localhost/api/v1/questions?tab=questions"));
    expect(mocks.findMany.mock.calls[1][0].where).toEqual({
      type: { in: ["WORD_CLOUD", "OPEN_ENDED", "SCALE"] },
    });
  });

  it("rejects unsupported types and standalone MCQ-only data at the backend boundary", async () => {
    const invalidType = await POST(jsonRequest({ name: "Name", question: "Prompt", type: "ESSAY" }));
    expect(invalidType.status).toBe(400);
    expect((await invalidType.json()).error.message).toBe("Unsupported question type");

    const choices = await POST(jsonRequest({
      name: "Name",
      question: "Prompt",
      type: "WORD_CLOUD",
      options: ["Choice"],
    }));
    expect(choices.status).toBe(400);
    expect((await choices.json()).error.message).toBe("Standalone questions cannot include choices");

    const scalarChoice = await POST(jsonRequest({
      name: "Name",
      question: "Prompt",
      type: "WORD_CLOUD",
      options: "Choice",
    }));
    expect(scalarChoice.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects empty standalone names and prompts", async () => {
    const emptyName = await POST(jsonRequest({ name: " ", question: "Prompt", type: "WORD_CLOUD" }));
    expect(emptyName.status).toBe(400);
    expect((await emptyName.json()).error.message).toBe("Question name is required");

    const emptyPrompt = await POST(jsonRequest({ name: "Name", question: " ", type: "OPEN_ENDED" }));
    expect(emptyPrompt.status).toBe(400);
    expect((await emptyPrompt.json()).error.message).toBe("Question is required");
  });

  it("forbids participants before reading or writing repository content", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "participant-1", role: "MENTEE" });

    const listResponse = await GET(new NextRequest("http://localhost/api/v1/questions"));
    const createResponse = await POST(jsonRequest({ name: "Name", question: "Prompt", type: "WORD_CLOUD" }));

    expect(listResponse.status).toBe(403);
    expect(createResponse.status).toBe(403);
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("preserves spreadsheet quiz imports as MULTIPLE_CHOICE items", async () => {
    const form = new FormData();
    form.set("file", new File([
      "Name,Question,Option1,Option2,ChartType\nImported quiz,Choose one,One,Two,PIE",
    ], "quizzes.csv", { type: "text/csv" }));

    const response = await PUT(new NextRequest("http://localhost/api/v1/questions", {
      method: "PUT",
      body: form,
    }));

    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        name: "Imported quiz",
        question: "Choose one",
        type: "MULTIPLE_CHOICE",
        chartType: "PIE",
        options: { create: [{ text: "One", order: 0 }, { text: "Two", order: 1 }] },
      }),
    }));
  });
});

describe("quiz choice limit", () => {
  const ten = Array.from({ length: 10 }, (_, i) => `Choice ${i + 1}`);

  it("saves a quiz with 10 choices in order and rejects 11", async () => {
    const ok = await POST(jsonRequest({ name: "Big quiz", question: "Pick", options: ten }));
    expect(ok.status).toBe(201);
    expect(mocks.create.mock.calls[0][0].data.options.create).toEqual(ten.map((text, order) => ({ text, order })));

    mocks.create.mockClear();
    const tooMany = await POST(jsonRequest({ name: "Too big", question: "Pick", options: [...ten, "Choice 11"] }));
    expect(tooMany.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("imports Option9 and Option10 columns from a spreadsheet", async () => {
    const header = ten.map((_, i) => `Option${i + 1}`).join(",");
    const form = new FormData();
    form.set("file", new File([`Name,Question,${header}
Ten,Pick one,${ten.join(",")}`], "ten.csv", { type: "text/csv" }));
    const response = await PUT(new NextRequest("http://localhost/api/v1/questions", { method: "PUT", body: form }));
    expect(response.status).toBe(201);
    expect(mocks.create.mock.calls[0][0].data.options.create).toHaveLength(10);
    expect(mocks.create.mock.calls[0][0].data.options.create[9]).toEqual({ text: "Choice 10", order: 9 });
  });
});

describe("question library item route", () => {
  it("provides the required staff-authorized get operation", () => {
    expect(typeof (itemRoute as Record<string, unknown>).GET).toBe("function");
  });

  it("gets a persisted standalone template by id", async () => {
    const response = await itemRoute.GET!(
      new NextRequest("http://localhost/api/v1/questions/question-1"),
      { params: Promise.resolve({ id: "question-1" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.item).toMatchObject({ id: "question-1", type: "WORD_CLOUD" });
  });

  it.each(["WORD_CLOUD", "OPEN_ENDED"] as const)("edits a %s template without creating options", async (type) => {
    const response = await itemRoute.PATCH(
      new NextRequest("http://localhost/api/v1/questions/question-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Updated", question: "Updated prompt", type }),
      }),
      { params: Promise.resolve({ id: "question-1" }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.deleteOptions).toHaveBeenCalledWith({ where: { questionId: "question-1" } });
    expect(mocks.update.mock.calls[0][0].data).toEqual({
      name: "Updated",
      question: "Updated prompt",
      type,
    });
  });

  it("preserves the existing multiple-choice update contract when type is omitted", async () => {
    mocks.findUnique.mockResolvedValueOnce({ ...quizRow, type: "MULTIPLE_CHOICE" });

    const response = await itemRoute.PATCH(
      new NextRequest("http://localhost/api/v1/questions/quiz-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Updated quiz", question: "Pick", options: ["A", "B"], chartType: "PIE" }),
      }),
      { params: Promise.resolve({ id: "quiz-1" }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.update.mock.calls[0][0].data).toMatchObject({
      name: "Updated quiz",
      question: "Pick",
      type: "MULTIPLE_CHOICE",
      chartType: "PIE",
    });
    expect(mocks.update.mock.calls[0][0].data.options.create).toEqual([
      { text: "A", order: 0 },
      { text: "B", order: 1 },
    ]);
  });

  it("preserves the legacy MCQ update error code", async () => {
    mocks.findUnique.mockResolvedValueOnce({ ...quizRow, type: "MULTIPLE_CHOICE" });

    const response = await itemRoute.PATCH(
      new NextRequest("http://localhost/api/v1/questions/quiz-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Invalid quiz", question: "Pick", options: ["Only one"] }),
      }),
      { params: Promise.resolve({ id: "quiz-1" }) }
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("QUIZ_UPDATE_ERROR");
  });

  it("rejects converting an existing quiz into a standalone question without deleting its choices", async () => {
    mocks.findUnique.mockResolvedValueOnce({ ...quizRow, type: "MULTIPLE_CHOICE" });

    const response = await itemRoute.PATCH(
      new NextRequest("http://localhost/api/v1/questions/quiz-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Converted", question: "Prompt", type: "WORD_CLOUD" }),
      }),
      { params: Promise.resolve({ id: "quiz-1" }) }
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toBe("Question family cannot be changed");
    expect(mocks.deleteOptions).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects converting a standalone question into a quiz", async () => {
    const response = await itemRoute.PATCH(
      new NextRequest("http://localhost/api/v1/questions/question-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Converted", question: "Pick", type: "MULTIPLE_CHOICE", options: ["A", "B"] }),
      }),
      { params: Promise.resolve({ id: "question-1" }) }
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toBe("Question family cannot be changed");
    expect(mocks.deleteOptions).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("deletes only the reusable template", async () => {
    const response = await itemRoute.DELETE(
      new NextRequest("http://localhost/api/v1/questions/question-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "question-1" }) }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { id: "question-1" } });
    expect(mocks.deleteItem).toHaveBeenCalledWith({ where: { id: "question-1" } });
  });

  it("preserves the legacy missing-quiz delete error code", async () => {
    mocks.deleteItem.mockRejectedValueOnce(new Error("Missing"));

    const response = await itemRoute.DELETE(
      new NextRequest("http://localhost/api/v1/questions/missing", { method: "DELETE" }),
      { params: Promise.resolve({ id: "missing" }) }
    );

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("QUIZ_NOT_FOUND");
  });

  it("forbids participant get, edit, and delete operations before database access", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "participant-1", role: "MENTEE" });
    const context = { params: Promise.resolve({ id: "question-1" }) };

    const getResponse = await itemRoute.GET!(new NextRequest("http://localhost/api/v1/questions/question-1"), context);
    const patchResponse = await itemRoute.PATCH(
      new NextRequest("http://localhost/api/v1/questions/question-1", {
        method: "PATCH",
        body: JSON.stringify({ name: "Name", question: "Prompt", type: "WORD_CLOUD" }),
      }),
      context
    );
    const deleteResponse = await itemRoute.DELETE(
      new NextRequest("http://localhost/api/v1/questions/question-1", { method: "DELETE" }),
      context
    );

    expect([getResponse.status, patchResponse.status, deleteResponse.status]).toEqual([403, 403, 403]);
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.deleteItem).not.toHaveBeenCalled();
  });
});
