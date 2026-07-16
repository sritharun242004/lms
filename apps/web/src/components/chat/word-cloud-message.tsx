"use client";

import * as React from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Download, Loader2, Lock, RotateCcw, Send, Trash2, Unlock } from "lucide-react";
import type { ChatMessage, WordCloudData } from "@/lib/api/services/message-service";
import { messageService } from "@/lib/api/services/message-service";
import { getInitials } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WordCloudCanvas } from "@/components/chat/word-cloud-canvas";
import { useConfirm } from "@/hooks/use-confirm";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function WordCloudMessage({
  message,
  wordCloud,
  groupId,
  isOwn,
  canManage,
  onSubmitted,
  onControlled,
  onDelete,
}: {
  message: ChatMessage;
  wordCloud: WordCloudData;
  groupId: string;
  isOwn: boolean;
  /** Mentors/admins only — gates the CSV/SVG export controls. */
  canManage: boolean;
  onSubmitted: (wordCloud: WordCloudData) => void;
  onControlled: (wordCloud: WordCloudData) => void;
  onDelete: (messageId: string) => void;
}) {
  const [draft, setDraft] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isControlling, setIsControlling] = React.useState(false);
  const canvasWrapRef = React.useRef<HTMLDivElement>(null);
  const [confirm, confirmDialog] = useConfirm();

  const remaining = wordCloud.maxWordsPerParticipant - wordCloud.mySubmissionCount;
  const canSubmit = !wordCloud.isLocked && remaining > 0;

  async function submit() {
    const text = draft.trim();
    if (!text || isSubmitting || !canSubmit) return;
    setIsSubmitting(true);
    try {
      const res = await messageService.submitWord(groupId, message.id, { text });
      if (!res.success) throw new Error(res.error?.message || "Failed to submit word");
      setDraft("");
      onSubmitted(res.data!.wordCloud);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to submit word");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function control(action: "reset" | "lock" | "unlock") {
    if (isControlling) return;
    if (action === "reset") {
      const ok = await confirm({
        title: "Clear all words in this cloud?",
        description: "This can't be undone.",
        confirmLabel: "Clear",
        destructive: true,
      });
      if (!ok) return;
    }
    setIsControlling(true);
    try {
      const res = await messageService.controlWordCloud(groupId, message.id, { action });
      if (!res.success) throw new Error(res.error?.message || "Failed to update word cloud");
      onControlled(res.data!.wordCloud);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update word cloud");
    } finally {
      setIsControlling(false);
    }
  }

  function exportCsv() {
    const rows = [
      "Word,Count",
      ...wordCloud.entries.map((e) => `${csvEscape(e.text)},${e.count}`),
    ];
    downloadBlob(new Blob([rows.join("\n")], { type: "text/csv" }), "word-cloud.csv");
  }

  function exportSvg() {
    const svg = canvasWrapRef.current?.querySelector("svg");
    if (!svg) {
      toast.error("Nothing to export yet");
      return;
    }
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const markup = new XMLSerializer().serializeToString(clone);
    downloadBlob(new Blob([markup], { type: "image/svg+xml" }), "word-cloud.svg");
  }

  return (
    <div className="mx-4 my-2 flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:mx-auto sm:max-w-3xl">
      {confirmDialog}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Avatar className="size-6">
            <AvatarFallback className="text-[10px]">
              {getInitials(message.sender.name)}
            </AvatarFallback>
          </Avatar>
          <span className="text-xs font-medium text-muted-foreground">
            {message.sender.name} · {format(new Date(message.createdAt), "h:mm a")}
          </span>
        </div>
        {isOwn && (
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              className="size-6"
              variant="ghost"
              disabled={isControlling}
              aria-label={wordCloud.isLocked ? "Unlock submissions" : "Lock submissions"}
              onClick={() => control(wordCloud.isLocked ? "unlock" : "lock")}
            >
              {wordCloud.isLocked ? <Unlock className="size-3" /> : <Lock className="size-3" />}
            </Button>
            <Button
              size="icon"
              className="size-6"
              variant="ghost"
              disabled={isControlling}
              aria-label="Reset word cloud"
              onClick={() => control("reset")}
            >
              <RotateCcw className="size-3" />
            </Button>
            <Button
              size="icon"
              className="size-6"
              variant="ghost"
              aria-label="Delete word cloud"
              onClick={() => onDelete(message.id)}
            >
              <Trash2 className="size-3" />
            </Button>
          </div>
        )}
      </div>

      <p className="font-medium">{wordCloud.question}</p>

      <div ref={canvasWrapRef} className="flex min-h-[240px] flex-col rounded-lg bg-muted/30">
        <WordCloudCanvas entries={wordCloud.entries} className="min-h-[240px]" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {wordCloud.totalParticipants} {wordCloud.totalParticipants === 1 ? "person" : "people"} ·{" "}
          {wordCloud.totalSubmissions} {wordCloud.totalSubmissions === 1 ? "word" : "words"}
          {wordCloud.isLocked && " · locked"}
        </span>
        {canManage && wordCloud.entries.length > 0 && (
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" className="h-6 gap-1 px-2 text-xs" onClick={exportCsv}>
              <Download className="size-3" />
              CSV
            </Button>
            <Button size="sm" variant="ghost" className="h-6 gap-1 px-2 text-xs" onClick={exportSvg}>
              <Download className="size-3" />
              SVG
            </Button>
          </div>
        )}
      </div>

      {canSubmit ? (
        <div className="flex flex-col gap-1.5 rounded-xl border-2 border-primary/30 bg-primary/5 p-2.5">
          {wordCloud.maxWordsPerParticipant > 1 && (
            <span className="px-0.5 text-xs font-medium text-muted-foreground">
              {remaining} of {wordCloud.maxWordsPerParticipant} word
              {wordCloud.maxWordsPerParticipant === 1 ? "" : "s"} left
            </span>
          )}
          <div className="flex items-center gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="Type one word…"
              maxLength={wordCloud.maxWordLength}
              disabled={isSubmitting}
              className="h-10 border-input bg-background text-base shadow-sm"
            />
            <Button
              size="icon"
              className="h-10 w-10 shrink-0"
              onClick={submit}
              disabled={!draft.trim() || isSubmitting}
            >
              {isSubmitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-center text-xs text-muted-foreground">
          {wordCloud.isLocked
            ? "Submissions are locked."
            : "You've used all your submissions for this cloud."}
        </p>
      )}
    </div>
  );
}
