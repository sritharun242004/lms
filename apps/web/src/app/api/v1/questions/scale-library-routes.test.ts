import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  findMany: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  deleteOptions: vi.fn(),
  deleteStatements: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    questionLibraryItem: {
      findMany: mocks.findMany,
      findUnique: mocks.findUnique,
      create: mocks.create,
    },
    questionLibraryOption: { deleteMany: mocks.deleteOptions },
    questionLibraryScaleStatement: { deleteMany: mocks.deleteStatements },
    $transaction: mocks.transaction,
  },
}));

import { GET, POST } from "./route";
import * as itemRoute from "./[id]/route";

function request(method: string, body?: unknown, url = "http://localhost/api/v1/questions") {
  return new NextRequest(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const idParams = { params: Promise.resolve({ id: "scale-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "coach-1", role: "MENTOR" });
  mocks.findMany.mockResolvedValue([]);
  mocks.create.mockImplementation(async ({ data }) => ({
    id: "created-1",
    ...data,
    options: [],
    scaleStatements: data.scaleStatements?.create ?? [],
    createdBy: { name: "Coach" },
  }));
  mocks.update.mockImplementation(async ({ data }) => ({
    id: "scale-1",
    options: [],
    createdBy: { name: "Coach" },
    ...data,
    scaleStatements: data.scaleStatements?.create ?? [],
  }));
  mocks.deleteOptions.mockResolvedValue({ count: 0 });
  mocks.deleteStatements.mockResolvedValue({ count: 0 });
  mocks.transaction.mockImplementation(async (callback) =>
    callback({
      questionLibraryItem: { update: mocks.update },
      questionLibraryOption: { deleteMany: mocks.deleteOptions },
      questionLibraryScaleStatement: { deleteMany: mocks.deleteStatements },
    })
  );
});

describe("Scale repository templates", () => {
  it("creates a SCALE template with multiple ordered statements and a default maximum of 5", async () => {
    const response = await POST(
      request("POST", {
        name: "End of day",
        type: "SCALE",
        statements: [{ text: "I understand today's topic." }, { text: "I feel confident.", max: 7 }, { text: "I'd recommend it.", max: 10 }],
      })
    );

    expect(response.status).toBe(201);
    const data = mocks.create.mock.calls[0][0].data;
    expect(data.type).toBe("SCALE");
    expect(data.scaleStatements.create).toEqual([
      { text: "I understand today's topic.", max: 5, order: 0 },
      { text: "I feel confident.", max: 7, order: 1 },
      { text: "I'd recommend it.", max: 10, order: 2 },
    ]);
  });

  it.each([0, 11, 2.5, -1])("rejects an invalid maximum of %s", async (max) => {
    const response = await POST(request("POST", { name: "Bad", type: "SCALE", statements: [{ text: "A", max }] }));
    expect(response.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects empty statements, no statements and a missing name", async () => {
    for (const body of [
      { name: "A", type: "SCALE", statements: [{ text: "  " }] },
      { name: "A", type: "SCALE", statements: [] },
      { name: "A", type: "SCALE" },
      { name: " ", type: "SCALE", statements: [{ text: "Fine" }] },
    ]) {
      expect((await POST(request("POST", body))).status).toBe(400);
    }
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("edits statement text and maximum by replacing only the template's own statements", async () => {
    mocks.findUnique.mockResolvedValue({ type: "SCALE" });
    const response = await itemRoute.PATCH(
      request("PATCH", { name: "End of day", statements: [{ text: "I understand today's lecture.", max: 10 }] }),
      idParams
    );

    expect(response.status).toBe(200);
    expect(mocks.deleteStatements).toHaveBeenCalledWith({ where: { questionId: "scale-1" } });
    expect(mocks.deleteOptions).not.toHaveBeenCalled();
    expect(mocks.update.mock.calls[0][0].data.scaleStatements.create).toEqual([
      { text: "I understand today's lecture.", max: 10, order: 0 },
    ]);
  });

  it("refuses to convert between Scale and other families before deleting anything", async () => {
    mocks.findUnique.mockResolvedValue({ type: "SCALE" });
    const toWordCloud = await itemRoute.PATCH(request("PATCH", { name: "x", question: "y", type: "WORD_CLOUD" }), idParams);
    expect(toWordCloud.status).toBe(400);

    mocks.findUnique.mockResolvedValue({ type: "WORD_CLOUD" });
    const toScale = await itemRoute.PATCH(
      request("PATCH", { name: "x", type: "SCALE", statements: [{ text: "A" }] }),
      idParams
    );
    expect(toScale.status).toBe(400);

    mocks.findUnique.mockResolvedValue({ type: "MULTIPLE_CHOICE" });
    const quizToScale = await itemRoute.PATCH(
      request("PATCH", { name: "x", type: "SCALE", statements: [{ text: "A" }] }),
      idParams
    );
    expect(quizToScale.status).toBe(400);

    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.deleteOptions).not.toHaveBeenCalled();
    expect(mocks.deleteStatements).not.toHaveBeenCalled();
  });

  it("lists Scale on the Questions tab while the Quizzes tab stays MULTIPLE_CHOICE only", async () => {
    await GET(new NextRequest("http://localhost/api/v1/questions?tab=questions"));
    expect(mocks.findMany.mock.calls[0][0].where).toEqual({ type: { in: ["WORD_CLOUD", "OPEN_ENDED", "SCALE"] } });
    expect(mocks.findMany.mock.calls[0][0].include.scaleStatements).toEqual({ orderBy: { order: "asc" } });

    await GET(new NextRequest("http://localhost/api/v1/questions"));
    expect(mocks.findMany.mock.calls[1][0].where).toEqual({ type: "MULTIPLE_CHOICE" });
  });

  it("leaves legacy MCQ, Word Cloud and Open-ended creation untouched", async () => {
    await POST(request("POST", { name: "Quiz", question: "Pick", options: ["A", "B"] }));
    await POST(request("POST", { name: "Cloud", question: "One word?", type: "WORD_CLOUD" }));
    await POST(request("POST", { name: "Open", question: "Thoughts?", type: "OPEN_ENDED" }));

    const [quiz, cloud, open] = mocks.create.mock.calls.map((call) => call[0].data);
    expect(quiz.type).toBe("MULTIPLE_CHOICE");
    expect(quiz.options.create).toHaveLength(2);
    expect(quiz.scaleStatements).toBeUndefined();
    expect(cloud).toMatchObject({ type: "WORD_CLOUD", question: "One word?" });
    expect(open).toMatchObject({ type: "OPEN_ENDED", question: "Thoughts?" });
    expect(cloud.scaleStatements).toBeUndefined();
    expect(open.scaleStatements).toBeUndefined();
  });

  it("keeps participants out of the repository", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "p-1", role: "MENTEE" });
    expect((await POST(request("POST", { name: "A", type: "SCALE", statements: [{ text: "A" }] }))).status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
