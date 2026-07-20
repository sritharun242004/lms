"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { isToday, isYesterday, isThisYear, format } from "date-fns";
import {
  ArrowLeft,
  BarChart3,
  Cloud,
  Copy,
  Loader2,
  Lock,
  MessageSquareText,
  Plus,
  Send,
  Sparkles,
  Users,
} from "lucide-react";
import {
  MessageType,
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_ATTACHMENT_SIZE_MB,
  MAX_MESSAGE_LENGTH,
} from "@cms/shared";
import type {
  ChatMessage,
  OpenQuestionData,
  PollData,
  WordCloudData,
} from "@/lib/api/services/message-service";
import { messageService } from "@/lib/api/services/message-service";
import { upsertMessage as upsert, mergeLatest } from "@/lib/chat/merge";
import { useChatSocket } from "@/hooks/use-chat-socket";
import { useConfirm } from "@/hooks/use-confirm";
import { getInitials } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { JoinToast } from "@/components/chat/join-toast";
import { GroupMembersDialog } from "@/components/groups/group-members-dialog";
import { MessageBubble } from "@/components/chat/message-bubble";
import { PollFormDialog } from "@/components/chat/poll-form-dialog";
import { PollMessage } from "@/components/chat/poll-message";
import { OpenQuestionFormDialog } from "@/components/chat/open-question-form-dialog";
import { OpenQuestionMessage } from "@/components/chat/open-question-message";
import { WordCloudFormDialog } from "@/components/chat/word-cloud-form-dialog";
import { WordCloudMessage } from "@/components/chat/word-cloud-message";

function dateSeparatorLabel(date: Date): string {
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  if (isThisYear(date)) return format(date, "EEEE, MMM d");
  return format(date, "MMM d, yyyy");
}

const POLL_INTERVAL_MS = 4000;

export function ChatThread({
  groupId,
  groupName,
  memberCount,
  currentUserId,
  canManage,
  initialMessages,
  initialHasMore,
  showBackLink = true,
  inviteCode = null,
}: {
  groupId: string;
  groupName: string;
  memberCount: number;
  currentUserId: string;
  canManage: boolean;
  initialMessages: ChatMessage[];
  initialHasMore: boolean;
  showBackLink?: boolean;
  inviteCode?: { code: string; isActive: boolean } | null;
}) {
  const [messages, setMessages] = React.useState(initialMessages);
  const [hasMore, setHasMore] = React.useState(initialHasMore);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [isSending, setIsSending] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const isAtBottomRef = React.useRef(true);
  const messageIdsRef = React.useRef<Set<string>>(new Set(initialMessages.map((m) => m.id)));
  const [confirm, confirmDialog] = useConfirm();

  // Keep a live set of known message ids so polling can tell whether a
  // fetched batch actually introduces anything new (and thus whether to
  // auto-scroll a viewer who's pinned to the bottom).
  React.useEffect(() => {
    messageIdsRef.current = new Set(messages.map((m) => m.id));
  }, [messages]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  // The parent renders <ChatThread key={groupId} .../>, so this whole
  // component remounts with fresh state whenever the group changes —
  // no reset effect needed. Just scroll to the bottom once on mount.
  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, []);

  // Live updates without a reload. The realtime socket is the fast path,
  // but it silently does nothing when the realtime server is unreachable
  // (the common cause of "the mentee has to refresh to see new messages").
  // This effect polls the newest messages on an interval and reconciles
  // them in, and refreshes immediately whenever the tab regains focus, so
  // every viewer — mentors and read-only mentees alike — stays current.
  React.useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    async function refresh() {
      if (cancelled || inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        const res = await messageService.list(groupId);
        if (cancelled || !res.success || !res.data) return;
        const latest = res.data.messages;
        const hasNew = latest.some((m) => !messageIdsRef.current.has(m.id));
        setMessages((prev) => mergeLatest(prev, latest));
        if (hasNew && isAtBottomRef.current) {
          requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ block: "end" }));
        }
      } finally {
        inFlight = false;
      }
    }

    const timer = setInterval(refresh, POLL_INTERVAL_MS);
    // Fire an immediate catch-up when the user returns to the tab/window
    // instead of making them wait out the next interval.
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refresh);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refresh);
    };
  }, [groupId]);

  // "<name> joined" is announced once per person for the lifetime of this
  // thread. Socket reconnects re-emit group:join, so without this a viewer on
  // flaky wifi would be re-announced to everyone every few seconds.
  const announcedJoinsRef = React.useRef<Set<string>>(new Set());

  useChatSocket(groupId, {
    onPresenceJoin: ({ userId, userName, role }) => {
      if (userId === currentUserId) return;
      if (announcedJoinsRef.current.has(userId)) return;
      announcedJoinsRef.current.add(userId);
      toast.custom((id) => <JoinToast key={id} name={userName} role={role} />, {
        position: "bottom-right",
      });
    },
    onNew: (message) => {
      setMessages((prev) => upsert(prev, message));
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ block: "end" }));
    },
    onEdit: (message) => setMessages((prev) => upsert(prev, message)),
    onDelete: ({ messageId }) => setMessages((prev) => prev.filter((m) => m.id !== messageId)),
    onPin: ({ messageId, isPinned }) =>
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, isPinned } : m))),
    onPollVote: ({ messageId, options, totalVotes }) =>
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId || !m.poll) return m;
          const merged = m.poll.options.map((o) => {
            const updated = options.find((u) => u.id === o.id);
            return updated ? { ...o, voteCount: updated.voteCount } : o;
          });
          return { ...m, poll: { ...m.poll, options: merged, totalVotes } };
        })
      ),
    onOpenQuestionAnswer: ({ messageId, answer }) =>
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId || !m.openQuestion) return m;
          const index = m.openQuestion.answers.findIndex((a) => a.id === answer.id);
          const answers =
            index === -1
              ? [...m.openQuestion.answers, answer]
              : m.openQuestion.answers.map((a) => (a.id === answer.id ? answer : a));
          return { ...m, openQuestion: { ...m.openQuestion, answers } };
        })
      ),
    onWordCloudUpdate: ({ messageId, entry }) =>
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId || !m.wordCloud) return m;
          const index = m.wordCloud.entries.findIndex((e) => e.id === entry.id);
          const entries =
            index === -1
              ? [...m.wordCloud.entries, entry]
              : m.wordCloud.entries.map((e) => (e.id === entry.id ? entry : e));
          return {
            ...m,
            wordCloud: {
              ...m.wordCloud,
              entries,
              totalSubmissions: m.wordCloud.totalSubmissions + 1,
            },
          };
        })
      ),
    onWordCloudReset: ({ messageId }) =>
      setMessages((prev) =>
        prev.map((m) =>
          m.id !== messageId || !m.wordCloud
            ? m
            : {
                ...m,
                wordCloud: {
                  ...m.wordCloud,
                  entries: [],
                  totalSubmissions: 0,
                  totalParticipants: 0,
                  mySubmissionCount: 0,
                },
              }
        )
      ),
    onWordCloudLock: ({ messageId, isLocked }) =>
      setMessages((prev) =>
        prev.map((m) =>
          m.id !== messageId || !m.wordCloud ? m : { ...m, wordCloud: { ...m.wordCloud, isLocked } }
        )
      ),
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

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0 || isUploading) return;

    const oversized = files.filter((f) => f.size > MAX_ATTACHMENT_SIZE_BYTES);
    const validFiles = files.filter((f) => f.size <= MAX_ATTACHMENT_SIZE_BYTES);
    if (oversized.length > 0) {
      toast.error(
        oversized.length === 1
          ? `"${oversized[0].name}" is too large. Max size is ${MAX_ATTACHMENT_SIZE_MB}MB.`
          : `${oversized.length} files are too large. Max size is ${MAX_ATTACHMENT_SIZE_MB}MB.`
      );
    }
    if (validFiles.length === 0) return;

    // The backend stores one attachment per message, so multiple files become
    // multiple messages sent in sequence; only the first carries the caption.
    const caption = draft.trim();
    let captionPending = Boolean(caption);
    setIsUploading(true);
    setDraft("");
    for (const file of validFiles) {
      try {
        const res = await messageService.sendFile(
          groupId,
          file,
          captionPending ? caption : undefined
        );
        captionPending = false;
        if (!res.success) throw new Error(res.error?.message || `Failed to upload "${file.name}"`);
        setMessages((prev) => upsert(prev, res.data!));
        requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ block: "end" }));
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : `Failed to upload "${file.name}"`
        );
        if (captionPending) {
          setDraft(caption);
          captionPending = false;
        }
      }
    }
    setIsUploading(false);
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
    const ok = await confirm({
      title: "Delete this message?",
      description: "This can't be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
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

  function handlePollCreated(message: ChatMessage) {
    setMessages((prev) => upsert(prev, message));
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ block: "end" }));
  }

  function handlePollVoted(messageId: string, poll: PollData) {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, poll } : m)));
  }

  function handleOpenQuestionCreated(message: ChatMessage) {
    setMessages((prev) => upsert(prev, message));
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ block: "end" }));
  }

  function handleAnswered(messageId: string, openQuestion: OpenQuestionData) {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, openQuestion } : m)));
  }

  function handleWordCloudCreated(message: ChatMessage) {
    setMessages((prev) => upsert(prev, message));
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ block: "end" }));
  }

  function handleWordCloudChanged(messageId: string, wordCloud: WordCloudData) {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, wordCloud } : m)));
  }

  async function copyInviteCode() {
    if (!inviteCode) return;
    await navigator.clipboard.writeText(inviteCode.code);
    toast.success("Invite code copied");
  }

  let lastDateLabel = "";

  return (
    <div className="flex h-full flex-col">
      {confirmDialog}
      <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        {showBackLink && (
          <Button variant="ghost" size="icon" className="-ml-2 shrink-0 md:hidden" asChild>
            <Link href="/chat" aria-label="Back to chats">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
        )}
        {canManage ? (
          <GroupMembersDialog
            groupId={groupId}
            groupName={groupName}
            trigger={
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left hover:opacity-80"
                aria-label="View group members"
              >
                <Avatar>
                  <AvatarFallback>{getInitials(groupName)}</AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-semibold">{groupName}</span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="size-3" />
                    {memberCount} {memberCount === 1 ? "member" : "members"}
                  </span>
                </div>
              </button>
            }
          />
        ) : (
          <>
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
          </>
        )}
        {canManage && inviteCode?.isActive && (
          <button
            type="button"
            onClick={copyInviteCode}
            aria-label="Copy invite code"
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-dashed border-border bg-muted/50 px-2 py-1 text-left transition-colors hover:bg-muted"
          >
            <span className="font-mono text-xs font-medium tracking-wide">
              {inviteCode.code}
            </span>
            <Copy className="size-3 text-muted-foreground" />
          </button>
        )}
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto py-3"
      >
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
                {message.type === MessageType.POLL && message.poll ? (
                  <PollMessage
                    message={message}
                    poll={message.poll}
                    groupId={groupId}
                    isOwn={message.senderId === currentUserId}
                    onVoted={(poll) => handlePollVoted(message.id, poll)}
                    onDelete={handleDelete}
                  />
                ) : message.type === MessageType.OPEN_QUESTION && message.openQuestion ? (
                  <OpenQuestionMessage
                    message={message}
                    openQuestion={message.openQuestion}
                    groupId={groupId}
                    isOwn={message.senderId === currentUserId}
                    onAnswered={(openQuestion) => handleAnswered(message.id, openQuestion)}
                    onDelete={handleDelete}
                  />
                ) : message.type === MessageType.WORD_CLOUD && message.wordCloud ? (
                  <WordCloudMessage
                    message={message}
                    wordCloud={message.wordCloud}
                    groupId={groupId}
                    isOwn={message.senderId === currentUserId}
                    onSubmitted={(wordCloud) => handleWordCloudChanged(message.id, wordCloud)}
                    onControlled={(wordCloud) => handleWordCloudChanged(message.id, wordCloud)}
                    onDelete={handleDelete}
                  />
                ) : (
                  <MessageBubble
                    message={message}
                    isOwn={message.senderId === currentUserId}
                    canManage={canManage}
                    showSender={showSender}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onTogglePin={handleTogglePin}
                  />
                )}
              </React.Fragment>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {canManage ? (
        <div className="flex items-end gap-2 border-t border-border p-3">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileSelected}
          />
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            aria-label="Attach file"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {isUploading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="shrink-0" aria-label="Interactive tools">
                <Sparkles className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top">
              <PollFormDialog
                groupId={groupId}
                onCreated={handlePollCreated}
                trigger={
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                    <BarChart3 />
                    Multiple choice poll
                  </DropdownMenuItem>
                }
              />
              <OpenQuestionFormDialog
                groupId={groupId}
                onCreated={handleOpenQuestionCreated}
                trigger={
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                    <MessageSquareText />
                    Open ended question
                  </DropdownMenuItem>
                }
              />
              <WordCloudFormDialog
                groupId={groupId}
                onCreated={handleWordCloudCreated}
                trigger={
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                    <Cloud />
                    Word cloud
                  </DropdownMenuItem>
                }
              />
            </DropdownMenuContent>
          </DropdownMenu>

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
            maxLength={MAX_MESSAGE_LENGTH}
            className="max-h-40 min-w-0 flex-1 resize-none overflow-y-auto break-words whitespace-pre-wrap"
          />
          <Button size="icon" onClick={handleSend} disabled={!draft.trim() || isSending}>
            <Send className="size-4" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-1.5 border-t border-border p-3 text-sm text-muted-foreground">
          <Lock className="size-3.5" />
          Only coaches can post in this group
        </div>
      )}
    </div>
  );
}
