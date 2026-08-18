import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  canManage: false,
  getCurrentUser: vi.fn(),
  getGroupAccess: vi.fn(),
  findMessages: vi.fn(),
  findMessage: vi.fn(),
  upsertAnswer: vi.fn(),
  findAnswers: vi.fn(),
  broadcastToGroup: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/groups/access", () => ({ getGroupAccess: mocks.getGroupAccess }));
vi.mock("@/lib/realtime/broadcast", () => ({ broadcastToGroup: mocks.broadcastToGroup }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    message: {
      findMany: mocks.findMessages,
      findFirst: mocks.findMessage,
    },
    openAnswer: {
      upsert: mocks.upsertAnswer,
      findMany: mocks.findAnswers,
    },
  },
}));

import { GET } from "./route";
import { POST as submitAnswer } from "./[messageId]/open-question/answer/route";

const answerRow = {
  id: "answer-1",
  text: "Ask clearer questions.",
  userId: "participant-1",
  createdAt: new Date("2026-08-18T09:05:00.000Z"),
  user: {
    id: "participant-1",
    name: "Priya Participant",
    email: "priya@example.com",
    avatarUrl: "https://cdn.example.com/priya.png",
  },
};

const rawMessage = {
  id: "message-1",
  content: "What did you learn?",
  type: "OPEN_QUESTION",
  groupId: "group-1",
  senderId: "coach-1",
  sender: {
    id: "coach-1",
    name: "Asha Coach",
    email: "asha@example.com",
    role: "MENTOR",
    avatarUrl: null,
    status: "ACTIVE",
  },
  attachmentUrl: null,
  attachmentName: null,
  attachment: null,
  isPinned: false,
  isEdited: false,
  isDeleted: false,
  createdAt: new Date("2026-08-18T09:00:00.000Z"),
  updatedAt: new Date("2026-08-18T09:00:00.000Z"),
  poll: null,
  openQuestion: {
    id: "question-1",
    question: "What did you learn?",
    answers: [answerRow],
  },
  wordCloud: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "viewer-1", role: "MENTEE" });
  mocks.getGroupAccess.mockImplementation(async () => ({ canView: true, canManage: mocks.canManage }));
  mocks.findMessages.mockResolvedValue([rawMessage]);
  mocks.findMessage.mockResolvedValue({
    openQuestion: { id: "question-1", question: "What did you learn?", isClosed: false },
  });
  mocks.upsertAnswer.mockResolvedValue(answerRow);
  mocks.findAnswers.mockImplementation(async ({ select }: { select: Record<string, unknown> }) => [
    select.user ? answerRow : {
      id: answerRow.id,
      text: answerRow.text,
      userId: answerRow.userId,
      createdAt: answerRow.createdAt,
    },
  ]);
});

describe("role-shaped open-question APIs", () => {
  it("returns display-only participant attribution to a manager on message GET", async () => {
    mocks.canManage = true;
    mocks.getCurrentUser.mockResolvedValue({ id: "coach-1", role: "MENTOR" });

    const response = await GET(new NextRequest("http://localhost/api/v1/groups/group-1/messages"), {
      params: Promise.resolve({ id: "group-1" }),
    });
    const body = await response.json();

    expect(body.data.messages[0].openQuestion.answers[0]).toEqual({
      id: "answer-1",
      text: "Ask clearer questions.",
      createdAt: "2026-08-18T09:05:00.000Z",
      participant: {
        name: "Priya Participant",
        avatarUrl: "https://cdn.example.com/priya.png",
      },
    });
  });

  it("keeps participant GET payloads anonymous even if a row contains sensitive user data", async () => {
    mocks.canManage = false;

    const response = await GET(new NextRequest("http://localhost/api/v1/groups/group-1/messages"), {
      params: Promise.resolve({ id: "group-1" }),
    });
    const payload = JSON.stringify(await response.json());

    expect(payload).not.toContain("Priya Participant");
    expect(payload).not.toContain("priya@example.com");
    expect(payload).not.toContain("participant-1");
    expect(payload).not.toContain('"user"');
  });

  it("returns manager attribution after answer POST while broadcasting only the anonymous answer", async () => {
    mocks.canManage = true;
    mocks.getCurrentUser.mockResolvedValue({ id: "coach-1", role: "MENTOR" });

    const response = await submitAnswer(
      new NextRequest("http://localhost/api/v1/groups/group-1/messages/message-1/open-question/answer", {
        method: "POST",
        body: JSON.stringify({ text: "Ask clearer questions." }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id: "group-1", messageId: "message-1" }) }
    );
    const body = await response.json();

    expect(body.data.openQuestion.answers[0].participant).toEqual({
      name: "Priya Participant",
      avatarUrl: "https://cdn.example.com/priya.png",
    });
    expect(mocks.broadcastToGroup).toHaveBeenCalledWith(
      "group-1",
      "open-question:answer",
      {
        messageId: "message-1",
        openQuestionId: "question-1",
        answer: {
          id: "answer-1",
          text: "Ask clearer questions.",
          createdAt: "2026-08-18T09:05:00.000Z",
        },
      }
    );
    const broadcastPayload = JSON.stringify(mocks.broadcastToGroup.mock.calls[0]?.[2]);
    expect(broadcastPayload).not.toContain("Priya Participant");
    expect(broadcastPayload).not.toContain("priya@example.com");
    expect(broadcastPayload).not.toContain("participant-1");
  });

  it("keeps the answer POST response anonymous for participants", async () => {
    mocks.canManage = false;

    const response = await submitAnswer(
      new NextRequest("http://localhost/api/v1/groups/group-1/messages/message-1/open-question/answer", {
        method: "POST",
        body: JSON.stringify({ text: "Ask clearer questions." }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id: "group-1", messageId: "message-1" }) }
    );
    const payload = JSON.stringify(await response.json());

    expect(payload).not.toContain("Priya Participant");
    expect(payload).not.toContain("priya@example.com");
    expect(payload).not.toContain("participant-1");
    expect(payload).not.toContain('"user"');
  });
});
