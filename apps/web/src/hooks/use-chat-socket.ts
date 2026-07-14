"use client";

import * as React from "react";
import type { ChatMessage } from "@/lib/api/services/message-service";
import { authService } from "@/lib/api/services/auth-service";
import { connectSocket, getSocket } from "@/lib/socket/client";

interface PollVoteEvent {
  messageId: string;
  pollId: string;
  options: { id: string; voteCount: number }[];
  totalVotes: number;
}

interface OpenQuestionAnswerEvent {
  messageId: string;
  openQuestionId: string;
  answer: { id: string; text: string; createdAt: string };
}

interface WordCloudUpdateEvent {
  messageId: string;
  wordCloudId: string;
  entry: { id: string; text: string; count: number; color: string };
}

interface WordCloudResetEvent {
  messageId: string;
  wordCloudId: string;
}

interface WordCloudLockEvent {
  messageId: string;
  wordCloudId: string;
  isLocked: boolean;
}

interface ChatSocketHandlers {
  onNew?: (message: ChatMessage) => void;
  onEdit?: (message: ChatMessage) => void;
  onDelete?: (data: { messageId: string; groupId: string }) => void;
  onPin?: (data: { messageId: string; groupId: string; isPinned: boolean }) => void;
  onPollVote?: (data: PollVoteEvent) => void;
  onOpenQuestionAnswer?: (data: OpenQuestionAnswerEvent) => void;
  onWordCloudUpdate?: (data: WordCloudUpdateEvent) => void;
  onWordCloudReset?: (data: WordCloudResetEvent) => void;
  onWordCloudLock?: (data: WordCloudLockEvent) => void;
}

/**
 * Joins a group's realtime room for the lifetime of the component and
 * wires up message event listeners. The underlying socket connection
 * is a singleton shared across the app — this hook only manages this
 * group's room membership and listener registration.
 */
export function useChatSocket(groupId: string, handlers: ChatSocketHandlers) {
  const handlersRef = React.useRef(handlers);
  React.useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  React.useEffect(() => {
    let cancelled = false;

    async function fetchSocketToken(): Promise<string | null> {
      // Retry the socket-token fetch with backoff so a single flaky request
      // does not leave this component's socket listeners permanently unwired.
      const delays = [0, 1000, 3000, 5000];
      for (let attempt = 0; attempt < delays.length; attempt++) {
        if (cancelled) return null;
        if (delays[attempt] > 0) {
          await new Promise((r) => setTimeout(r, delays[attempt]));
          if (cancelled) return null;
        }
        try {
          const res = await authService.socketToken();
          if (res.success && res.data?.token) return res.data.token;
        } catch {
          // fall through to retry
        }
      }
      // Realtime is best-effort; chat-thread.tsx polls the DB every 4s as a
      // backup so users still receive messages even if the socket never wires.
      console.warn("[useChatSocket] socket-token fetch failed after 4 attempts; falling back to poll-only mode");
      return null;
    }

    async function join() {
      const socket = getSocket();
      if (!socket.connected) {
        const token = await fetchSocketToken();
        if (cancelled || !token) return;
        connectSocket(token);
      }
      if (cancelled) return;

      socket.emit("group:join", groupId);

      socket.on("message:new", handleNew);
      socket.on("message:edit", handleEdit);
      socket.on("message:delete", handleDelete);
      socket.on("message:pin", handlePin);
      socket.on("poll:vote", handlePollVote);
      socket.on("open-question:answer", handleOpenQuestionAnswer);
      socket.on("word-cloud:update", handleWordCloudUpdate);
      socket.on("word-cloud:reset", handleWordCloudReset);
      socket.on("word-cloud:lock", handleWordCloudLock);
    }

    function handleNew(message: ChatMessage) {
      if (message.groupId === groupId) handlersRef.current.onNew?.(message);
    }
    function handleEdit(message: ChatMessage) {
      if (message.groupId === groupId) handlersRef.current.onEdit?.(message);
    }
    function handleDelete(data: { messageId: string; groupId: string }) {
      if (data.groupId === groupId) handlersRef.current.onDelete?.(data);
    }
    function handlePin(data: { messageId: string; groupId: string; isPinned: boolean }) {
      if (data.groupId === groupId) handlersRef.current.onPin?.(data);
    }
    function handlePollVote(data: PollVoteEvent) {
      handlersRef.current.onPollVote?.(data);
    }
    function handleOpenQuestionAnswer(data: OpenQuestionAnswerEvent) {
      handlersRef.current.onOpenQuestionAnswer?.(data);
    }
    function handleWordCloudUpdate(data: WordCloudUpdateEvent) {
      handlersRef.current.onWordCloudUpdate?.(data);
    }
    function handleWordCloudReset(data: WordCloudResetEvent) {
      handlersRef.current.onWordCloudReset?.(data);
    }
    function handleWordCloudLock(data: WordCloudLockEvent) {
      handlersRef.current.onWordCloudLock?.(data);
    }

    join();

    return () => {
      cancelled = true;
      const socket = getSocket();
      socket.emit("group:leave", groupId);
      socket.off("message:new", handleNew);
      socket.off("message:edit", handleEdit);
      socket.off("message:delete", handleDelete);
      socket.off("message:pin", handlePin);
      socket.off("poll:vote", handlePollVote);
      socket.off("open-question:answer", handleOpenQuestionAnswer);
      socket.off("word-cloud:update", handleWordCloudUpdate);
      socket.off("word-cloud:reset", handleWordCloudReset);
      socket.off("word-cloud:lock", handleWordCloudLock);
    };
  }, [groupId]);
}
