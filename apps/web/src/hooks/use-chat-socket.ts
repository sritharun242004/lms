"use client";

import * as React from "react";
import type { ChatMessage } from "@/lib/api/services/message-service";
import { authService } from "@/lib/api/services/auth-service";
import { connectSocket, getSocket } from "@/lib/socket/client";

interface ChatSocketHandlers {
  onNew?: (message: ChatMessage) => void;
  onEdit?: (message: ChatMessage) => void;
  onDelete?: (data: { messageId: string; groupId: string }) => void;
  onPin?: (data: { messageId: string; groupId: string; isPinned: boolean }) => void;
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

    async function join() {
      const socket = getSocket();
      if (!socket.connected) {
        const res = await authService.socketToken();
        if (cancelled || !res.success) return;
        connectSocket(res.data!.token);
      }
      if (cancelled) return;

      socket.emit("group:join", groupId);

      socket.on("message:new", handleNew);
      socket.on("message:edit", handleEdit);
      socket.on("message:delete", handleDelete);
      socket.on("message:pin", handlePin);
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

    join();

    return () => {
      cancelled = true;
      const socket = getSocket();
      socket.emit("group:leave", groupId);
      socket.off("message:new", handleNew);
      socket.off("message:edit", handleEdit);
      socket.off("message:delete", handleDelete);
      socket.off("message:pin", handlePin);
    };
  }, [groupId]);
}
