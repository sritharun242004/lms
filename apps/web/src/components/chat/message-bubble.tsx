"use client";

import * as React from "react";
import { format } from "date-fns";
import { Pin, Pencil, Trash2, Check, X } from "lucide-react";
import type { ChatMessage } from "@/lib/api/services/message-service";
import { getInitials, cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

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

        <div className="relative">
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
                  className="min-w-64 bg-background text-foreground"
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
              <p className="whitespace-pre-wrap break-words">{message.content}</p>
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

          {!isEditing && (isOwn || canManage) && (
            <div
              className={cn(
                "absolute top-0 flex -translate-y-1/2 items-center gap-0.5 rounded-md border border-border bg-card p-0.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100",
                isOwn ? "right-2" : "left-2"
              )}
            >
              {canManage && (
                <Button
                  size="icon"
                  className="size-6"
                  variant="ghost"
                  aria-label={message.isPinned ? "Unpin" : "Pin"}
                  onClick={() => onTogglePin(message.id)}
                >
                  <Pin className="size-3" />
                </Button>
              )}
              {isOwn && (
                <>
                  <Button
                    size="icon"
                    className="size-6"
                    variant="ghost"
                    aria-label="Edit"
                    onClick={() => setIsEditing(true)}
                  >
                    <Pencil className="size-3" />
                  </Button>
                  <Button
                    size="icon"
                    className="size-6"
                    variant="ghost"
                    aria-label="Delete"
                    onClick={() => onDelete(message.id)}
                  >
                    <Trash2 className="size-3" />
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
