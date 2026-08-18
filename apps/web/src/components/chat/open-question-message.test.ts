/** @vitest-environment jsdom */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, render as renderComponent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessageType, UserRole, UserStatus } from "@cms/shared";
import { messageService } from "@/lib/api/services/message-service";
import type { ChatMessage, OpenQuestionData } from "@/lib/api/services/message-service";
import { OpenQuestionMessage } from "./open-question-message";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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
    expect(managerHtml).toContain('dateTime="2026-08-18T09:05:00.000Z"');
    expect(participantHtml).not.toContain("Priya Participant");
    expect(participantHtml).not.toContain("Ravi Participant");
    expect(participantHtml).toContain("Anonymous participant");
  });

  it("submits a new response with a working state, live success feedback, and preserved action focus", async () => {
    const user = userEvent.setup();
    const onAnswered = vi.fn();
    let resolveSubmit!: (value: Awaited<ReturnType<typeof messageService.submitAnswer>>) => void;
    vi.spyOn(messageService, "submitAnswer").mockImplementation(
      () => new Promise((resolve) => { resolveSubmit = resolve; })
    );
    const unanswered = { ...openQuestion, myAnswerId: null, answers: [] };

    renderComponent(createElement(OpenQuestionMessage, {
      message,
      openQuestion: unanswered,
      groupId: "group-1",
      isOwn: false,
      canManage: false,
      onAnswered,
      onDelete: vi.fn(),
    }));

    const textarea = screen.getByRole("textbox", { name: "Your response" });
    await user.type(textarea, "A new response");
    const submitButton = screen.getByRole("button", { name: "Submit response" });
    await user.click(submitButton);
    expect(screen.getByRole("button", { name: "Submitting…" }).hasAttribute("disabled")).toBe(true);

    resolveSubmit({
      success: true,
      data: {
        openQuestion: {
          ...unanswered,
          myAnswerId: "answer-new",
          answers: [{
            id: "answer-new",
            text: "A new response",
            createdAt: "2026-08-18T10:00:00.000Z",
          }],
        },
      },
    });

    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("Your response was submitted.");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(document.activeElement).toBe(submitButton);
    expect(onAnswered).toHaveBeenCalledOnce();
  });

  it("updates an existing response and exposes accessible error recovery without clearing the draft", async () => {
    const user = userEvent.setup();
    const onAnswered = vi.fn();
    vi.spyOn(messageService, "submitAnswer")
      .mockResolvedValueOnce({
        success: false,
        error: { code: "NETWORK_ERROR", message: "Connection lost. Try again." },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          openQuestion: {
            ...openQuestion,
            answers: openQuestion.answers.map((answer) =>
              answer.id === openQuestion.myAnswerId
                ? { ...answer, text: "Revised response again" }
                : answer
            ),
          },
        },
      });

    renderComponent(createElement(OpenQuestionMessage, {
      message,
      openQuestion,
      groupId: "group-1",
      isOwn: false,
      canManage: false,
      onAnswered,
      onDelete: vi.fn(),
    }));

    const textarea = screen.getByRole("textbox", { name: "Your response" });
    await user.clear(textarea);
    await user.type(textarea, "Revised response");
    await user.click(screen.getByRole("button", { name: "Update response" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Connection lost. Try again.");
    expect(alert.getAttribute("aria-live")).toBe("assertive");
    expect(document.activeElement).toBe(textarea);
    expect(textarea.getAttribute("aria-invalid")).toBe("true");
    expect(textarea.getAttribute("aria-describedby")).toContain(alert.id);
    expect((textarea as HTMLTextAreaElement).value).toBe("Revised response");

    await user.type(textarea, " again");
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.getByText("22 / 280")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Update response" }));

    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("Your response was updated.");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(onAnswered).toHaveBeenCalledOnce();
  });
});
