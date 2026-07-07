"use client";

import * as React from "react";
import { toast } from "sonner";
import { isToday, isYesterday, isThisYear, format } from "date-fns";
import { Lock, Send, Users } from "lucide-react";
import { MessageType } from "@lms/shared";
import type { ChatMessage } from "@/lib/api/services/message-service";
import { messageService } from "@/lib/api/services/message-service";
import { useChatSocket } from "@/hooks/use-chat-socket";
import { getInitials } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageBubble } from "@/components/chat/message-bubble";

function dateSeparatorLabel(date: Date): string {
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  if (isThisYear(date)) return format(date, "EEEE, MMM d");
  return format(date, "MMM d, yyyy");
}

function upsert(messages: ChatMessage[], incoming: ChatMessage): ChatMessage[] {
  const index = messages.findIndex((m) => m.id === incoming.id);
  if (index === -1) return [...messages, incoming];
  const next = messages.slice();
  next[index] = incoming;
  return next;
}

export function ChatThread({
  groupId,
  groupName,
  memberCount,
  currentUserId,
  canManage,
  initialMessages,
  initialHasMore,
}: {
  groupId: string;
  groupName: string;
  memberCount: number;
  currentUserId: string;
  canManage: boolean;
  initialMessages: ChatMessage[];
  initialHasMore: boolean;
}) {
  const [messages, setMessages] = React.useState(initialMessages);
  const [hasMore, setHasMore] = React.useState(initialHasMore);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [isSending, setIsSending] = React.useState(false);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // The parent renders <ChatThread key={groupId} .../>, so this whole
  // component remounts with fresh state whenever the group changes —
  // no reset effect needed. Just scroll to the bottom once on mount.
  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, []);

  useChatSocket(groupId, {
    onNew: (message) => {
      setMessages((prev) => upsert(prev, message));
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ block: "end" }));
    },
    onEdit: (message) => setMessages((prev) => upsert(prev, message)),
    onDelete: ({ messageId }) => setMessages((prev) => prev.filter((m) => m.id !== messageId)),
    onPin: ({ messageId, isPinned }) =>
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, isPinned } : m))),
  });

  async function loadOlder() {
    if (messages.length === 0) return;
    setIsLoadingMore(true);
    try {
      const oldest = messages[0];
      const res = await messageService.list(groupId, oldest.createdAt);
      if (res.success) {
        setMessages((prev) => [...res.data!.messages, ...prev]);
        setHasMore(res.data!.hasMore);
      }
    } finally {
      setIsLoadingMore(false);
    }
  }

  async function handleSend() {
    const content = draft.trim();
    if (!content || isSending) return;
    setIsSending(true);
    setDraft("");
    try {
      const res = await messageService.send(groupId, { content, type: MessageType.TEXT });
      if (!res.success) throw new Error(res.error?.message || "Failed to send message");
      setMessages((prev) => upsert(prev, res.data!));
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ block: "end" }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send message");
      setDraft(content);
    } finally {
      setIsSending(false);
    }
  }

  async function handleEdit(messageId: string, content: string) {
    try {
      const res = await messageService.edit(groupId, messageId, { content });
      if (!res.success) throw new Error(res.error?.message || "Failed to edit message");
      setMessages((prev) => upsert(prev, res.data!));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to edit message");
    }
  }

  async function handleDelete(messageId: string) {
    if (!window.confirm("Delete this message?")) return;
    try {
      const res = await messageService.remove(groupId, messageId);
      if (!res.success) throw new Error(res.error?.message || "Failed to delete message");
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete message");
    }
  }

  async function handleTogglePin(messageId: string) {
    try {
      const res = await messageService.togglePin(groupId, messageId);
      if (!res.success) throw new Error(res.error?.message || "Failed to update pin");
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, isPinned: res.data!.isPinned } : m))
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update pin");
    }
  }

  let lastDateLabel = "";

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        <Avatar>
          <AvatarFallback>{getInitials(groupName)}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col">
          <span className="text-sm font-semibold">{groupName}</span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="size-3" />
            {memberCount} {memberCount === 1 ? "member" : "members"}
          </span>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto py-3">
        {hasMore && (
          <div className="flex justify-center pb-2">
            <Button size="sm" variant="outline" onClick={loadOlder} disabled={isLoadingMore}>
              {isLoadingMore ? "Loading…" : "Load older messages"}
            </Button>
          </div>
        )}

        {messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No messages yet{canManage ? " — say hello!" : "."}
          </p>
        ) : (
          messages.map((message, index) => {
            const date = new Date(message.createdAt);
            const label = dateSeparatorLabel(date);
            const showDate = label !== lastDateLabel;
            lastDateLabel = label;

            const prev = messages[index - 1];
            const showSender = !prev || prev.senderId !== message.senderId || showDate;

            return (
              <React.Fragment key={message.id}>
                {showDate && (
                  <div className="my-2 flex justify-center">
                    <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                      {label}
                    </span>
                  </div>
                )}
                <MessageBubble
                  message={message}
                  isOwn={message.senderId === currentUserId}
                  canManage={canManage}
                  showSender={showSender}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onTogglePin={handleTogglePin}
                />
              </React.Fragment>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {canManage ? (
        <div className="flex items-end gap-2 border-t border-border p-3">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Type an announcement…"
            rows={1}
            className="max-h-40 flex-1 resize-none"
          />
          <Button size="icon" onClick={handleSend} disabled={!draft.trim() || isSending}>
            <Send className="size-4" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-1.5 border-t border-border p-3 text-sm text-muted-foreground">
          <Lock className="size-3.5" />
          Only mentors can post in this group
        </div>
      )}
    </div>
  );
}
