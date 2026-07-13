"use client";

import * as React from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Pin,
  Pencil,
  Trash2,
  Check,
  X,
  Copy,
  Download,
  File as FileIcon,
  FileText,
  FileSpreadsheet,
  Presentation,
} from "lucide-react";
import { MAX_MESSAGE_LENGTH } from "@lms/shared";
import type { ChatMessage } from "@/lib/api/services/message-service";
import { getInitials, cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileTypeIcon({ mimeType, fileName }: { mimeType: string; fileName: string }) {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (mimeType === "application/pdf" || ext === "pdf") return <FileText className="size-6" />;
  if (
    mimeType.includes("spreadsheet") ||
    mimeType === "text/csv" ||
    ["xls", "xlsx", "csv"].includes(ext)
  )
    return <FileSpreadsheet className="size-6" />;
  if (mimeType.includes("presentation") || ["ppt", "pptx"].includes(ext))
    return <Presentation className="size-6" />;
  if (mimeType.includes("word") || ["doc", "docx"].includes(ext))
    return <FileText className="size-6" />;
  return <FileIcon className="size-6" />;
}

function AttachmentPreview({ message }: { message: ChatMessage }) {
  if (!message.attachmentUrl) return null;
  const mimeType = message.attachment?.mimeType ?? "";
  const fileName = message.attachmentName ?? "Attachment";
  const inlineUrl = `${message.attachmentUrl}?inline=1`;

  if (mimeType.startsWith("image/")) {
    return (
      <a href={inlineUrl} target="_blank" rel="noopener noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={inlineUrl}
          alt={fileName}
          className="max-h-64 max-w-full rounded-lg object-contain"
        />
      </a>
    );
  }

  if (mimeType.startsWith("video/")) {
    return (
      <video src={inlineUrl} controls className="max-h-64 max-w-full rounded-lg">
        Your browser does not support video playback.
      </video>
    );
  }

  if (mimeType.startsWith("audio/")) {
    return (
      <audio src={inlineUrl} controls className="w-full min-w-56">
        Your browser does not support audio playback.
      </audio>
    );
  }

  return (
    <a
      href={message.attachmentUrl}
      className={cn(
        "flex items-center gap-2.5 rounded-lg border border-border/50 bg-background/40 px-3 py-2 text-inherit no-underline",
        "hover:bg-background/70"
      )}
    >
      <FileTypeIcon mimeType={mimeType} fileName={fileName} />
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium">{fileName}</span>
        {message.attachment && (
          <span className="text-xs opacity-70">{formatFileSize(message.attachment.size)}</span>
        )}
      </div>
    </a>
  );
}

const LONG_PRESS_MS = 450;
const MOVE_CANCEL_PX = 10;

interface MessageBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
  canManage: boolean;
  showSender: boolean;
  onEdit: (messageId: string, content: string) => Promise<void>;
  onDelete: (messageId: string) => void;
  onTogglePin: (messageId: string) => void;
}

export function MessageBubble({
  message,
  isOwn,
  canManage,
  showSender,
  onEdit,
  onDelete,
  onTogglePin,
}: MessageBubbleProps) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(message.content);
  const [isSaving, setIsSaving] = React.useState(false);
  const [showActions, setShowActions] = React.useState(false);
  const longPressTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = React.useRef<{ x: number; y: number } | null>(null);
  const actionsWrapRef = React.useRef<HTMLDivElement>(null);

  // Mentors reveal the action bar with a long-press on mobile (mirrors WhatsApp);
  // mentees never manage messages, so their copy button stays visible by default.
  function clearLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (!canManage || e.pointerType !== "touch") return;
    pressStart.current = { x: e.clientX, y: e.clientY };
    clearLongPress();
    longPressTimer.current = setTimeout(() => setShowActions(true), LONG_PRESS_MS);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!pressStart.current) return;
    const dx = e.clientX - pressStart.current.x;
    const dy = e.clientY - pressStart.current.y;
    if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) clearLongPress();
  }

  function handlePointerUp() {
    clearLongPress();
    pressStart.current = null;
  }

  React.useEffect(() => {
    if (!canManage || !showActions) return;
    function handleOutside(e: PointerEvent) {
      if (actionsWrapRef.current && !actionsWrapRef.current.contains(e.target as Node)) {
        setShowActions(false);
      }
    }
    document.addEventListener("pointerdown", handleOutside);
    return () => document.removeEventListener("pointerdown", handleOutside);
  }, [canManage, showActions]);

  async function saveEdit() {
    if (!draft.trim() || draft === message.content) {
      setIsEditing(false);
      setDraft(message.content);
      return;
    }
    setIsSaving(true);
    await onEdit(message.id, draft.trim());
    setIsSaving(false);
    setIsEditing(false);
  }

  async function copyMessage() {
    await navigator.clipboard.writeText(message.content || message.attachmentName || "");
    toast.success("Message copied");
  }

  // Mentees get bigger, always-visible copy/download controls so they can
  // grab any message or file with an easy tap; mentors keep the compact
  // hover/long-press toolbar that also carries edit/delete/pin.
  const btnSize = canManage ? "size-6" : "size-8";
  const iconSize = canManage ? "size-3" : "size-4";
  const canCopy = Boolean(message.content || message.attachmentName);

  return (
    <div className={cn("group flex gap-2 px-4 py-1", isOwn ? "justify-end" : "justify-start")}>
      {!isOwn && (
        <Avatar className="size-8 self-end">
          <AvatarFallback className="text-xs">{getInitials(message.sender.name)}</AvatarFallback>
        </Avatar>
      )}

      <div className={cn("flex max-w-[70%] flex-col gap-1", isOwn && "items-end")}>
        {showSender && !isOwn && (
          <span className="px-1 text-xs font-medium text-muted-foreground">
            {message.sender.name}
          </span>
        )}

        <div
          ref={actionsWrapRef}
          className="relative"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          <div
            className={cn(
              "rounded-2xl px-3.5 py-2 text-sm",
              isOwn
                ? "rounded-br-sm bg-primary text-primary-foreground"
                : "rounded-bl-sm bg-muted text-foreground"
            )}
          >
            {message.isPinned && (
              <span className="mb-1 flex items-center gap-1 text-xs opacity-80">
                <Pin className="size-3" />
                Pinned
              </span>
            )}

            {isEditing ? (
              <div className="flex flex-col gap-2">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={2}
                  maxLength={MAX_MESSAGE_LENGTH}
                  className="max-h-60 min-w-64 max-w-full resize-none overflow-y-auto break-words whitespace-pre-wrap bg-background text-foreground"
                  autoFocus
                />
                <div className="flex justify-end gap-1">
                  <Button
                    size="icon"
                    className="size-7"
                    variant="ghost"
                    onClick={() => setIsEditing(false)}
                  >
                    <X className="size-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    className="size-7"
                    variant="secondary"
                    onClick={saveEdit}
                    disabled={isSaving}
                  >
                    <Check className="size-3.5" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <AttachmentPreview message={message} />
                {message.content && (
                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
                )}
              </div>
            )}

            {!isEditing && (
              <span
                className={cn(
                  "mt-1 flex items-center gap-1 text-[11px] opacity-70",
                  isOwn ? "justify-end" : "justify-start"
                )}
              >
                {message.isEdited && "edited · "}
                {format(new Date(message.createdAt), "h:mm a")}
              </span>
            )}
          </div>

          {!isEditing && (
            <div
              className={cn(
                "absolute top-0 flex -translate-y-1/2 items-center gap-0.5 rounded-md border border-border bg-card p-0.5 shadow-sm transition-opacity",
                canManage
                  ? cn(showActions ? "opacity-100" : "opacity-0", "md:opacity-0 md:group-hover:opacity-100")
                  : "opacity-100",
                isOwn ? "right-2" : "left-2"
              )}
            >
              {canCopy && (
                <Button
                  size="icon"
                  className={btnSize}
                  variant="ghost"
                  aria-label="Copy message"
                  onClick={copyMessage}
                >
                  <Copy className={iconSize} />
                </Button>
              )}
              {message.attachmentUrl && (
                <Button size="icon" className={btnSize} variant="ghost" aria-label="Download file" asChild>
                  <a href={message.attachmentUrl} download={message.attachmentName ?? undefined}>
                    <Download className={iconSize} />
                  </a>
                </Button>
              )}
              {canManage && (
                <Button
                  size="icon"
                  className={btnSize}
                  variant="ghost"
                  aria-label={message.isPinned ? "Unpin" : "Pin"}
                  onClick={() => onTogglePin(message.id)}
                >
                  <Pin className={iconSize} />
                </Button>
              )}
              {isOwn && (
                <>
                  <Button
                    size="icon"
                    className={btnSize}
                    variant="ghost"
                    aria-label="Edit"
                    onClick={() => setIsEditing(true)}
                  >
                    <Pencil className={iconSize} />
                  </Button>
                  <Button
                    size="icon"
                    className={btnSize}
                    variant="ghost"
                    aria-label="Delete"
                    onClick={() => onDelete(message.id)}
                  >
                    <Trash2 className={iconSize} />
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
