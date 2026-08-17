"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { isToday, isYesterday, isThisYear, format } from "date-fns";
import {
  ArrowLeft,
  BarChart3,
  Cloud,
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
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { MessageBubble } from "@/components/chat/message-bubble";
import { PollFormDialog } from "@/components/chat/poll-form-dialog";
import { PollMessage } from "@/components/chat/poll-message";
import { OpenQuestionFormDialog } from "@/components/chat/open-question-form-dialog";
import { OpenQuestionMessage } from "@/components/chat/open-question-message";
import { WordCloudFormDialog } from "@/components/chat/word-cloud-form-dialog";
import { WordCloudMessage } from "@/components/chat/word-cloud-message";
import { applyMemberCount, friendlyUploadError, isSupportedChatFile, removeUploadByKey } from "@/lib/cms/task-requirements";

type UploadRow = { key: string; name: string; loaded: number; total: number; status: "uploading" | "completed" | "failed"; error?: string };

function dateSeparatorLabel(date: Date): string {
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  if (isThisYear(date)) return format(date, "EEEE, MMM d");
  return format(date, "MMM d, yyyy");
}

const POLL_INTERVAL_MS = 2000;

export function ChatThread({
  groupId,
  groupName,
  groupDescription,
  memberCount,
  currentUserId,
  canManage,
  initialMessages,
  initialHasMore,
  backHref,
}: {
  groupId: string;
  groupName: string;
  groupDescription: string | null;
  memberCount: number;
  currentUserId: string;
  canManage: boolean;
  initialMessages: ChatMessage[];
  initialHasMore: boolean;
  backHref: string | null;
}) {
  const [messages, setMessages] = React.useState(initialMessages);
  const searchParams = useSearchParams();
  const [hasMore, setHasMore] = React.useState(initialHasMore);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [isSending, setIsSending] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const [displayMemberCount, setDisplayMemberCount] = React.useState(memberCount);
  const [displayGroupName, setDisplayGroupName] = React.useState(groupName);
  const [displayGroupDescription, setDisplayGroupDescription] = React.useState(groupDescription);
  const [hasPendingPollTemplate, setHasPendingPollTemplate] = React.useState(false);
  const [uploads, setUploads] = React.useState<UploadRow[]>([]);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const uploadCleanupTimersRef = React.useRef<Set<number>>(new Set());
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
    const timer = window.setTimeout(
      () => setHasPendingPollTemplate(Boolean(sessionStorage.getItem("cms-poll-template"))),
      0
    );
    return () => window.clearTimeout(timer);
  }, []);

  React.useEffect(() => () => {
    uploadCleanupTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    uploadCleanupTimersRef.current.clear();
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
    onMembersChanged: (event) =>
      setDisplayMemberCount((current) => applyMemberCount(current, event, groupId)),
    onGroupUpdated: ({ name, description }) => {
      setDisplayGroupName(name);
      setDisplayGroupDescription(description);
    },
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
    await uploadFiles(files);
  }

  async function uploadFiles(files: File[]) {
    if (files.length === 0 || isUploading) return;
    const validFiles = files.filter((file) => {
      const result = isSupportedChatFile(file);
      if (!result.ok) toast.error(result.message);
      return result.ok;
    });
    if (validFiles.length === 0) return;

    // The backend stores one attachment per message, so multiple files become
    // multiple messages sent in sequence; only the first carries the caption.
    const caption = draft.trim();
    let captionPending = Boolean(caption);
    setIsUploading(true);
    setDraft("");
    for (const file of validFiles) {
      const key = `${file.name}:${file.size}:${file.lastModified}`;
      setUploads((rows) => [...rows.filter((row) => row.key !== key), { key, name: file.name, loaded: 0, total: file.size, status: "uploading" }]);
      try {
        const res = await messageService.sendFile(
          groupId,
          file,
          captionPending ? caption : undefined,
          (loaded, total) => setUploads((rows) => rows.map((row) => row.key === key ? { ...row, loaded, total: total || file.size } : row))
        );
        captionPending = false;
        if (!res.success) throw new Error(res.error?.message || `Failed to upload "${file.name}"`);
        setMessages((prev) => upsert(prev, res.data!));
        setUploads((rows) => rows.map((row) => row.key === key ? { ...row, loaded: file.size, total: file.size, status: "completed" } : row));
        const cleanupTimer = window.setTimeout(() => {
          setUploads((rows) => removeUploadByKey(rows, key));
          uploadCleanupTimersRef.current.delete(cleanupTimer);
        }, 1500);
        uploadCleanupTimersRef.current.add(cleanupTimer);
        requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ block: "end" }));
      } catch (error) {
        const message = friendlyUploadError(error instanceof Error ? error.message : `Failed to upload ${file.name}`);
        toast.error(message);
        setUploads((rows) => rows.map((row) => row.key === key ? { ...row, status: "failed", error: message } : row));
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

  let lastDateLabel = "";

  return (
    <div className="flex h-full flex-col" onDragOver={(event) => { if (canManage && event.dataTransfer.types.includes("Files")) event.preventDefault(); }} onDrop={(event) => { if (!canManage) return; event.preventDefault(); void uploadFiles(Array.from(event.dataTransfer.files)); }}>
      {confirmDialog}
      {canManage && (searchParams.get("openPoll") === "1" || hasPendingPollTemplate) && (
        <PollFormDialog
          autoOpen
          groupId={groupId}
          onCreated={handlePollCreated}
          trigger={<span className="hidden" />}
        />
      )}
      <div className="flex items-center gap-3 border-b border-border/60 bg-white/28 px-4 py-3 backdrop-blur-xl dark:bg-white/[.02]">
        {backHref && (
          <Button variant="ghost" size="icon" className="-ml-2 shrink-0" asChild>
            <Link href={backHref} aria-label="Back">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
        )}
        {canManage ? (
          <GroupMembersDialog
            groupId={groupId}
            groupName={displayGroupName}
            trigger={
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left hover:opacity-80"
                aria-label="View group members"
              >
                <Avatar>
                  <AvatarFallback>{getInitials(displayGroupName)}</AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-semibold">{displayGroupName}</span>
                  {displayGroupDescription && <span className="truncate text-xs text-muted-foreground">{displayGroupDescription}</span>}
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="size-3" />
                    {displayMemberCount} {displayMemberCount === 1 ? "participant" : "participants"}
                  </span>
                </div>
              </button>
            }
          />
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Avatar>
              <AvatarFallback>{getInitials(displayGroupName)}</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold">{displayGroupName}</span>
              {displayGroupDescription && <span className="truncate text-xs text-muted-foreground">{displayGroupDescription}</span>}
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="size-3" />
                {displayMemberCount} {displayMemberCount === 1 ? "participant" : "participants"}
              </span>
            </div>
          </div>
        )}
        {!canManage && <ThemeToggle />}
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-white/10 py-3 dark:bg-transparent"
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
        <div className="border-t border-border/60 bg-white/32 p-3 backdrop-blur-xl dark:bg-white/[.02]">
          {uploads.length > 0 && <div className="mb-3 space-y-2">{uploads.map((row) => { const percent = row.total > 0 ? Math.round((row.loaded / row.total) * 100) : 0; return <div key={row.key} className="rounded-xl bg-background/70 p-2 text-xs"><div className="flex justify-between gap-3"><span className="truncate font-medium">{row.name}</span><span className={row.status === "failed" ? "text-destructive" : "text-muted-foreground"}>{row.status === "completed" ? "Completed" : row.status === "failed" ? "Failed" : `${percent}% · ${(row.loaded / 1048576).toFixed(1)} / ${(row.total / 1048576).toFixed(1)} MB`}</span></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className={row.status === "failed" ? "h-full bg-destructive" : "h-full bg-primary transition-[width]"} style={{ width: `${row.status === "failed" ? 100 : percent}%` }} /></div>{row.error && <p className="mt-1 text-destructive">{row.error}</p>}</div>; })}</div>}
          <div className="flex items-end gap-2">
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
        </div>
      ) : (
        <div className="flex items-center justify-center gap-1.5 border-t border-border/60 bg-white/32 p-3 text-sm text-muted-foreground backdrop-blur-xl dark:bg-white/[.02]">
          <Lock className="size-3.5" />
          Only authorized participants can post in this group
        </div>
      )}
    </div>
  );
}
