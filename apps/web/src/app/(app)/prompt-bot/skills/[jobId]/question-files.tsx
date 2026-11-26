"use client";
import * as React from "react";
import { FolderOpen, Paperclip, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, type ConfirmDialogHandle } from "@/components/ui/confirm-dialog";
import type { FileHint, JobFileView, TaskQuestionView } from "@/lib/skills/jobs/types";
import { cn } from "@/lib/utils";
import { FILE_ACCEPT, FileCard, FileLimitContext, fileHelp, UploadRows, useUploadQueue, type AskConfirm } from "./file-card";

export const HINT_LABEL: Record<FileHint, string> = {
  TEMPLATE: "Template or design system",
  REFERENCE: "Reference or example",
  INPUT: "Input data",
  BRAND: "Brand assets",
};
const NOTE_FALLBACK = "This question asks for a file. Add one if you have it.";
const GENERAL_NOTE = "Files added before questions had their own uploads, or from removed questions. Your skills still use them.";

type Props = {
  jobId: string;
  /** The selected "Answer now" question; null shows General files (no upload). */
  question: TaskQuestionView | null;
  /** The files to list here: the question's own, or the general ones. */
  files: JobFileView[];
  aiConfigured: boolean;
  onFileChange(file: JobFileView): void;
  onFileRemoved(fileId: string): void;
};

/**
 * Files for one question. Every "Answer now" question takes uploads; one that asks for files gets a
 * prominent upload with its kind of file and what to upload, the rest a quieter optional one.
 */
export function QuestionFiles({ jobId, question, files, aiConfigured, onFileChange, onFileRemoved }: Props) {
  const headingId = React.useId();
  const confirmRef = React.useRef<ConfirmDialogHandle>(null);
  const askConfirm: AskConfirm = React.useCallback((options) => confirmRef.current?.open(options) ?? Promise.resolve(false), []);
  const cards = files.length > 0 && (
    <ul className="mt-3 flex flex-col gap-3" aria-label={question ? "Files for this question" : "General files"}>
      {files.map((f) => (
        <li key={f.id}>
          <FileCard jobId={jobId} file={f} aiConfigured={aiConfigured} askConfirm={askConfirm} onChange={onFileChange} onRemoved={onFileRemoved} flat />
        </li>
      ))}
    </ul>
  );

  if (!question) {
    return (
      <section className="glass rounded-[1.75rem] p-4 sm:p-5" aria-labelledby={headingId}>
        <h2 id={headingId} className="flex items-center gap-2 text-base font-semibold">
          <FolderOpen className="size-4 text-primary" aria-hidden />
          General files
        </h2>
        <p className="mt-1 text-xs text-pretty text-muted-foreground">{GENERAL_NOTE}</p>
        {cards}
        <ConfirmDialog ref={confirmRef} />
      </section>
    );
  }
  if (question.kind !== "FIXED") return null;

  return (
    <section className="mt-5 border-t border-border/60 pt-4" aria-labelledby={headingId}>
      <h3 id={headingId} className="flex items-center gap-2 text-sm font-semibold">
        <Paperclip className="size-4 text-muted-foreground" aria-hidden />
        Files for this question
        {files.length > 0 && <span className="rounded-full bg-black/5 px-1.5 text-xs tabular-nums dark:bg-white/10">{files.length}</span>}
      </h3>
      <UploadZone key={question.id} jobId={jobId} question={question} aiConfigured={aiConfigured} onFileChange={onFileChange} />
      {cards}
      <ConfirmDialog ref={confirmRef} />
    </section>
  );
}

type ZoneProps = { jobId: string; question: TaskQuestionView; aiConfigured: boolean; onFileChange(file: JobFileView): void };

/** Keyed by question: switching questions starts a fresh queue, while uploads already sent still land. */
function UploadZone({ jobId, question, aiConfigured, onFileChange }: ZoneProps) {
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const maxBytes = React.useContext(FileLimitContext);
  const { rows, enqueue, dismiss, retry } = useUploadQueue({ jobId, questionId: question.id, enabled: aiConfigured, maxBytes, onFileChange });
  const prominent = question.wantsFiles;
  const hint = prominent && question.fileHint ? HINT_LABEL[question.fileHint] : null;

  return (
    <>
      <div
        data-testid="file-drop-zone"
        onDragOver={(e) => {
          e.preventDefault();
          if (aiConfigured) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          enqueue(Array.from(e.dataTransfer.files));
        }}
        className={cn(
          "mt-3 rounded-2xl border border-dashed px-4 py-3.5 transition-colors",
          prominent ? "border-primary/35 bg-primary/5 dark:bg-primary/10" : "border-border/80",
          dragging && "border-primary bg-primary/10",
        )}
      >
        {prominent && (
          <div className="mb-3 flex flex-col gap-1.5">
            {hint && (
              <Badge variant="secondary" className="bg-primary/10 text-primary dark:bg-primary/20 dark:text-brand-300">
                {hint}
              </Badge>
            )}
            <p className="text-sm text-pretty">{question.fileNote.trim() || NOTE_FALLBACK}</p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={FILE_ACCEPT}
            disabled={!aiConfigured}
            aria-label="Choose files to upload"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              enqueue(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant={prominent ? "default" : "outline"}
            size={prominent ? "default" : "sm"}
            className="min-h-11 sm:min-h-9"
            disabled={!aiConfigured}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="size-4" aria-hidden />
            {prominent ? "Add files" : "Add files (optional)"}
          </Button>
          <p className="min-w-0 flex-1 basis-56 text-xs text-pretty text-muted-foreground">
            <span className="hidden sm:inline">Or drop them here. </span>
            {fileHelp(maxBytes)}
          </p>
        </div>
      </div>
      {rows.length > 0 && (
        <div className="mt-3">
          <UploadRows rows={rows} onDismiss={dismiss} onRetry={retry} />
        </div>
      )}
    </>
  );
}
