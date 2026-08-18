import { describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/lib/api/services/message-service";
import { handleOpenQuestionAnswerEvent } from "./chat-thread";

function message(id: string, answerText: string, participantName?: string): ChatMessage {
  const createdAt = `2026-08-18T09:${id.slice(-2).padStart(2, "0")}:00.000Z`;
  return {
    id,
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
      status: "ONLINE",
    },
    attachmentUrl: null,
    attachmentName: null,
    isPinned: false,
    isEdited: false,
    isDeleted: false,
    createdAt,
    updatedAt: createdAt,
    openQuestion: {
      id: `question-${id}`,
      question: "What did you learn?",
      myAnswerId: null,
      answers: [
        {
          id: "answer-1",
          text: answerText,
          createdAt: "2026-08-18T10:00:00.000Z",
          ...(participantName
            ? { participant: { name: participantName, avatarUrl: null } }
            : {}),
        },
      ],
    },
  } as ChatMessage;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("manager open-question socket refresh", () => {
  it("refreshes the exact older loaded message instead of the latest page", async () => {
    let messages = Array.from({ length: 60 }, (_, index) =>
      message(`message-${String(index).padStart(2, "0")}`, "Existing answer")
    );
    const targetId = "message-00";
    const getMessage = vi.fn().mockResolvedValue({
      success: true,
      data: message(targetId, "New answer", "Priya Participant"),
    });

    await handleOpenQuestionAnswerEvent({
      canManage: true,
      groupId: "group-1",
      event: {
        messageId: targetId,
        answer: {
          id: "answer-1",
          text: "New answer",
          createdAt: "2026-08-18T10:00:00.000Z",
        },
      },
      updateMessages: (updater) => {
        messages = updater(messages);
      },
      getMessage,
      refreshVersions: new Map(),
      onRefreshError: vi.fn(),
    });

    expect(getMessage).toHaveBeenCalledWith("group-1", targetId);
    expect(messages).toHaveLength(60);
    expect(messages.find((item) => item.id === targetId)?.openQuestion?.answers[0]).toEqual({
      id: "answer-1",
      text: "New answer",
      createdAt: "2026-08-18T10:00:00.000Z",
      participant: { name: "Priya Participant", avatarUrl: null },
    });
  });

  it("keeps the anonymous answer and reports recovery guidance when manager refetch fails", async () => {
    let messages = [message("message-00", "Existing answer", "Priya Participant")];
    const onRefreshError = vi.fn();

    await expect(
      handleOpenQuestionAnswerEvent({
        canManage: true,
        groupId: "group-1",
        event: {
          messageId: "message-00",
          answer: {
            id: "answer-1",
            text: "Updated anonymously",
            createdAt: "2026-08-18T10:01:00.000Z",
          },
        },
        updateMessages: (updater) => {
          messages = updater(messages);
        },
        getMessage: async () => {
          throw new Error("Network unavailable");
        },
        refreshVersions: new Map(),
        onRefreshError,
      })
    ).resolves.toBeUndefined();

    expect(messages[0].openQuestion?.answers[0]).toEqual({
      id: "answer-1",
      text: "Updated anonymously",
      createdAt: "2026-08-18T10:01:00.000Z",
    });
    expect(onRefreshError).toHaveBeenCalledWith(
      "Response received, but participant details could not be refreshed. Reload to try again."
    );
  });

  it("ignores a stale refetch when rapid events for the same question resolve out of order", async () => {
    let messages = [message("message-00", "Existing answer")];
    const first = deferred<{ success: boolean; data?: ChatMessage }>();
    const second = deferred<{ success: boolean; data?: ChatMessage }>();
    const getMessage = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const versions = new Map<string, number>();
    const updateMessages = (updater: (current: ChatMessage[]) => ChatMessage[]) => {
      messages = updater(messages);
    };
    const base = {
      canManage: true,
      groupId: "group-1",
      updateMessages,
      getMessage,
      refreshVersions: versions,
      onRefreshError: vi.fn(),
    };

    const firstRun = handleOpenQuestionAnswerEvent({
      ...base,
      event: {
        messageId: "message-00",
        answer: {
          id: "answer-1",
          text: "First event",
          createdAt: "2026-08-18T10:01:00.000Z",
        },
      },
    });
    const secondRun = handleOpenQuestionAnswerEvent({
      ...base,
      event: {
        messageId: "message-00",
        answer: {
          id: "answer-1",
          text: "Second event",
          createdAt: "2026-08-18T10:02:00.000Z",
        },
      },
    });

    second.resolve({
      success: true,
      data: message("message-00", "Second event", "Latest Participant"),
    });
    await secondRun;
    first.resolve({
      success: true,
      data: message("message-00", "First event", "Stale Participant"),
    });
    await firstRun;

    expect(messages[0].openQuestion?.answers[0].text).toBe("Second event");
    expect(messages[0].openQuestion?.answers[0].participant?.name).toBe("Latest Participant");
  });
});
