import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MessageType, UserRole, UserStatus } from "@cms/shared";
import type { ChatMessage, OpenQuestionData } from "@/lib/api/services/message-service";
import { OpenQuestionMessage } from "./open-question-message";

const message: ChatMessage = {
  id: "message-1",
  content: "What did you learn?",
  type: MessageType.OPEN_QUESTION,
  groupId: "group-1",
  senderId: "coach-1",
  sender: {
    id: "coach-1",
    name: "Asha Coach",
    email: "asha@example.com",
    role: UserRole.MENTOR,
    avatarUrl: null,
    status: UserStatus.ONLINE,
  },
  attachmentUrl: null,
  attachmentName: null,
  attachment: null,
  isPinned: false,
  isEdited: false,
  isDeleted: false,
  createdAt: "2026-08-18T09:00:00.000Z",
  updatedAt: "2026-08-18T09:00:00.000Z",
  poll: null,
  wordCloud: null,
};

const openQuestion: OpenQuestionData = {
  id: "question-1",
  question: "What did you learn?",
  myAnswerId: "answer-1",
  answers: [
    {
      id: "answer-1",
      text: "Ask clearer questions.",
      createdAt: "2026-08-18T09:05:00.000Z",
      participant: { name: "Priya Participant", avatarUrl: null },
    },
    {
      id: "answer-2",
      text: "Listen before solving.",
      createdAt: "2026-08-18T09:06:00.000Z",
      participant: { name: "Ravi Participant", avatarUrl: null },
    },
  ],
};

function render(canManage: boolean) {
  return renderToStaticMarkup(
    createElement(OpenQuestionMessage, {
      message,
      openQuestion,
      groupId: "group-1",
      isOwn: false,
      canManage,
      onAnswered: vi.fn(),
      onDelete: vi.fn(),
    })
  );
}

describe("OpenQuestionMessage response wall", () => {
  it("renders clear instructions, count, multiline counter, update state, and own-answer ownership", () => {
    const html = render(false);

    expect(html).toContain("Share one thoughtful response. You can update it later.");
    expect(html).toContain("2 responses");
    expect(html).toContain("<textarea");
    expect(html).toContain('maxLength="280"');
    expect(html).toContain("22 / 280");
    expect(html).toContain("Update response");
    expect(html).toContain("Your response");
    expect(html).toContain('data-response-tone="');
  });

  it("shows display-only participant attribution and response time only in manager rendering", () => {
    const managerHtml = render(true);
    const participantHtml = render(false);

    expect(managerHtml).toContain("Priya Participant");
    expect(managerHtml).toContain("2:35 PM");
    expect(participantHtml).not.toContain("Priya Participant");
    expect(participantHtml).not.toContain("Ravi Participant");
    expect(participantHtml).toContain("Anonymous participant");
  });
});
