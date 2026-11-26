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

describe("serializeMessage formInvitation", () => {
  const formMessage = {
    ...rawMessage,
    type: "FORM",
    openQuestion: null,
    formInvitations: [
      {
        id: "invitation-1",
        status: "SENT",
        recipientUserId: "participant-1",
        form: { title: "Day 1 feedback", description: "Tell us how it went" },
      },
    ],
  };

  it("surfaces the viewer's own invitation as theirs to fill, scoped by the select's where clause", () => {
    const result = serializeMessage(formMessage, "participant-1", false);
    expect(result.formInvitation).toEqual({
      id: "invitation-1",
      status: "SENT",
      formTitle: "Day 1 feedback",
      formDescription: "Tell us how it went",
      mine: true,
    });
  });

  it("is null when the viewer has no invitation row for this message", () => {
    const result = serializeMessage({ ...formMessage, formInvitations: [] }, "participant-1", false);
    expect(result.formInvitation).toBeNull();
  });

  it("gives a manager any invitation row for the title/description, marked as not theirs to fill", () => {
    // The sender is staff, never a recipient, so the select's where clause
    // (canManage: true) has no recipientUserId filter and can only return
    // some participant's row — never the manager's own.
    const result = serializeMessage(formMessage, "coach-1", true);
    expect(result.formInvitation).toEqual({
      id: "invitation-1",
      status: "SENT",
      formTitle: "Day 1 feedback",
      formDescription: "Tell us how it went",
      mine: false,
    });
  });
});
