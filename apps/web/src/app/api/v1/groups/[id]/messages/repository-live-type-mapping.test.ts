import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getGroupAccess: vi.fn(),
  transaction: vi.fn(),
  messageCreate: vi.fn(),
  pollCreate: vi.fn(),
  openQuestionCreate: vi.fn(),
  wordCloudCreate: vi.fn(),
  findMessage: vi.fn(),
  auditCreate: vi.fn(),
  broadcastToGroup: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/groups/access", () => ({ getGroupAccess: mocks.getGroupAccess }));
vi.mock("@/lib/realtime/broadcast", () => ({ broadcastToGroup: mocks.broadcastToGroup }));
vi.mock("@/lib/messages/serialize", () => ({
  messageSelect: () => ({}),
  serializeMessage: (message: unknown) => message,
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    message: { findUniqueOrThrow: mocks.findMessage },
    auditLog: { create: mocks.auditCreate },
  },
}));

import { POST as postPoll } from "./poll/route";
import { POST as postOpenQuestion } from "./open-question/route";
import { POST as postWordCloud } from "./word-cloud/route";

const context = { params: Promise.resolve({ id: "group-1" }) };

function request(path: string, body: unknown) {
  return new NextRequest(`http://localhost/api/v1/groups/group-1/messages/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "coach-1", role: "MENTOR" });
  mocks.getGroupAccess.mockResolvedValue({ canView: true, canManage: true });
  mocks.messageCreate.mockResolvedValue({ id: "message-1" });
  mocks.pollCreate.mockResolvedValue({ id: "poll-1" });
  mocks.openQuestionCreate.mockResolvedValue({ id: "open-1" });
  mocks.wordCloudCreate.mockResolvedValue({ id: "cloud-1" });
  mocks.findMessage.mockResolvedValue({ id: "message-1", type: "TEST" });
  mocks.auditCreate.mockResolvedValue({ id: "audit-1" });
  mocks.transaction.mockImplementation(async (callback) => callback({
    message: { create: mocks.messageCreate },
    poll: { create: mocks.pollCreate },
    openQuestion: { create: mocks.openQuestionCreate },
    wordCloud: { create: mocks.wordCloudCreate },
  }));
});

describe("repository template to existing live message mapping", () => {
  it("keeps MULTIPLE_CHOICE publishing on the existing POLL pipeline", async () => {
    const response = await postPoll(request("poll", {
      question: "Choose one",
      options: ["A", "B"],
      chartType: "BAR",
    }), context);

    expect(response.status).toBe(201);
    expect(mocks.messageCreate.mock.calls[0][0].data).toMatchObject({ type: "POLL", content: "Choose one" });
    expect(mocks.pollCreate).toHaveBeenCalledTimes(1);
  });

  it("publishes WORD_CLOUD through the existing WORD_CLOUD pipeline", async () => {
    const response = await postWordCloud(request("word-cloud", {
      question: "One word?",
      maxWordsPerParticipant: 1,
      allowMultipleSubmissions: false,
      profanityFilter: true,
    }), context);

    expect(response.status).toBe(201);
    expect(mocks.messageCreate.mock.calls[0][0].data).toMatchObject({ type: "WORD_CLOUD", content: "One word?" });
    expect(mocks.wordCloudCreate).toHaveBeenCalledTimes(1);
  });

  it("publishes OPEN_ENDED through the existing OPEN_QUESTION pipeline", async () => {
    const response = await postOpenQuestion(request("open-question", { question: "What changed?" }), context);

    expect(response.status).toBe(201);
    expect(mocks.messageCreate.mock.calls[0][0].data).toMatchObject({ type: "OPEN_QUESTION", content: "What changed?" });
    expect(mocks.openQuestionCreate).toHaveBeenCalledTimes(1);
  });
});
