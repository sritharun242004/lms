import { describe, expect, it } from "vitest";
import { serializeMessage } from "./serialize";

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
    answers: [
      {
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
      },
    ],
  },
  wordCloud: null,
};

describe("serializeMessage open-answer identity", () => {
  it("gives managers display-only participant identity and response time", () => {
    const result = serializeMessage(rawMessage, "coach-1", true);

    expect(result.openQuestion?.answers).toEqual([
      {
        id: "answer-1",
        text: "Ask clearer questions.",
        createdAt: "2026-08-18T09:05:00.000Z",
        participant: {
          name: "Priya Participant",
          avatarUrl: "https://cdn.example.com/priya.png",
        },
      },
    ]);
  });

  it("never exposes another participant identity or database identifiers to participants", () => {
    const result = serializeMessage(rawMessage, "participant-2", false);
    const answer = result.openQuestion?.answers[0];
    const payload = JSON.stringify(result.openQuestion);

    expect(answer).toEqual({
      id: "answer-1",
      text: "Ask clearer questions.",
      createdAt: "2026-08-18T09:05:00.000Z",
    });
    expect(payload).not.toContain("Priya Participant");
    expect(payload).not.toContain("priya@example.com");
    expect(payload).not.toContain("participant-1");
    expect(payload).not.toContain('"user"');
  });
});
