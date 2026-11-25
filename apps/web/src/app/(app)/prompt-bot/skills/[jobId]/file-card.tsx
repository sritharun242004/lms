"use client";
import * as React from "react";
import { AlertTriangle, FileImage, FileSpreadsheet, FileText, Loader2, PenLine, Pencil, Presentation, RotateCcw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ConfirmDialogHandle } from "@/components/ui/confirm-dialog";
import { Textarea } from "@/components/ui/textarea";
import { SafeMarkdown } from "@/components/prompt-bot/safe-markdown";
import { KIND_LABEL, type SkillFileKind } from "@/lib/skills/files/types";
import { analyseAgain, removeJobFile, saveAnalysis, uploadJobFile } from "@/lib/skills/jobs/client";
import { formatBytes } from "@/lib/skills/jobs/format";
import type { JobFileView } from "@/lib/skills/jobs/types";
import { JOB_LIMITS } from "@/lib/skills/limits";
import { cn } from "@/lib/utils";

export const FILE_ACCEPT = ".pptx,.docx,.xlsx,.pdf,.png,.jpg,.jpeg";
export const FILE_MB = JOB_LIMITS.fileBytes / (1024 * 1024);
/** Accepted types and caps, under every upload button. */
export const FILE_HELP = `PowerPoint, Word, Excel, PDF, PNG or JPG · up to ${FILE_MB} MB each · ${JOB_LIMITS.filesPerJob} files per task`;
const KIND_ICON: Record<SkillFileKind, typeof FileText> = {
  PPTX: Presentation,
  DOCX: FileText,
  XLSX: FileSpreadsheet,
  PDF: FileText,
  PNG: FileImage,
  JPEG: FileImage,
};
const PROSE =
  "max-w-prose text-sm leading-relaxed text-pretty [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs dark:[&_code]:bg-white/10 [&_h1]:mt-4 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mt-4 [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:font-semibold [&_li]:mt-1 [&_ol]:mt-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&>:first-child]:mt-0";
/** Card actions: 44 px tall on phones, compact from sm up. */
const ACTION = "min-h-11 sm:min-h-8";
const UPLOAD_FAILED = "We couldn't upload this file. Refresh the page to see if it arrived, then try again.";

export type AskConfirm = ConfirmDialogHandle["open"];
export type UploadRow = { key: number; name: string; status: "waiting" | "uploading" | "failed"; message?: string };

type QueueOptions = { jobId: string; questionId?: string | null; enabled: boolean; onFileChange(file: JobFileView): void };

/**
 * Uploads one file at a time, in the order chosen; each has a row until it lands as a card. A file over
 * the size cap fails on its own row without being sent. With a question, each upload is attached to it.
 */
export function useUploadQueue({ jobId, questionId, enabled, onFileChange }: QueueOptions) {
  const [rows, setRows] = React.useState<UploadRow[]>([]);
  const queue = React.useRef<Promise<void>>(Promise.resolve());
  const nextKey = React.useRef(0);
  const latest = React.useRef({ jobId, questionId, onFileChange });
  React.useEffect(() => {
    latest.current = { jobId, questionId, onFileChange };
  });
  const patchRow = (key: number, patch: Partial<UploadRow>) => setRows((all) => all.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const dismiss = React.useCallback((key: number) => setRows((all) => all.filter((r) => r.key !== key)), []);

  function enqueue(list: File[]) {
    if (!enabled) return;
    for (const file of list) {
      const key = ++nextKey.current;
      if (file.size > JOB_LIMITS.fileBytes) {
        setRows((all) => [...all, { key, name: file.name, status: "failed", message: `This file is over ${FILE_MB} MB. Upload a smaller copy.` }]);
        continue;
      }
      setRows((all) => [...all, { key, name: file.name, status: "waiting" }]);
      // Each upload settles on its own row, so one that throws never stops the ones after it.
      queue.current = queue.current
        .then(async () => {
          patchRow(key, { status: "uploading" });
          const { jobId: job, questionId: question } = latest.current;
          const result = question ? await uploadJobFile(job, file, question) : await uploadJobFile(job, file);
          if (!result.ok) return patchRow(key, { status: "failed", message: result.message });
          latest.current.onFileChange(result.data);
          dismiss(key);
        })
        .catch(() => patchRow(key, { status: "failed", message: UPLOAD_FAILED }));
    }
  }

  return { rows, enqueue, dismiss };
}

/** One row per chosen file until it lands as a card; a failure stays (readable next to its name) until dismissed. */
export function UploadRows({ rows, onDismiss }: { rows: UploadRow[]; onDismiss(key: number): void }) {
  return (
    <ul className="flex flex-col gap-2" aria-label="Uploads">
      {rows.map((row) => {
        const failed = row.status === "failed";
        return (
          <li key={row.key} className={cn("flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm", failed ? "bg-destructive/10" : "bg-primary/5")}>
            {failed ? (
              <AlertTriangle className="size-4 shrink-0 text-destructive" aria-hidden />
            ) : (
              <Loader2 className={cn("size-4 shrink-0 text-primary", row.status === "uploading" ? "animate-spin" : "opacity-50")} aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium" title={row.name}>
                {row.name}
              </p>
              <p className={cn("text-xs text-pretty", failed ? "text-destructive" : "text-muted-foreground")} role={failed ? "alert" : "status"}>
                {failed ? row.message : row.status === "uploading" ? "Uploading…" : "Waiting…"}
              </p>
            </div>
            {failed && (
              <Button variant="ghost" size="icon" className="size-11 shrink-0 sm:size-9" onClick={() => onDismiss(row.key)}>
                <X className="size-4" aria-hidden />
                <span className="sr-only">Dismiss {row.name}</span>
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

type CardProps = {
  jobId: string;
  file: JobFileView;
  aiConfigured: boolean;
  askConfirm: AskConfirm;
  onChange(file: JobFileView): void;
  onRemoved(fileId: string): void;
};

export function FileCard({ jobId, file, aiConfigured, askConfirm, onChange, onRemoved }: CardProps) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [busy, setBusy] = React.useState<"save" | "analyse" | "remove" | null>(null);
  const Icon = KIND_ICON[file.kind];
  const headingId = `file-${file.id}`;
  const pending = file.analysisStatus === "PENDING";
  const ready = file.analysisStatus === "READY";
  const showEditor = editing && !pending;
  // Closing the editor unmounts the button that had focus: hand focus back to the card's first action.
  const actionsRef = React.useRef<HTMLDivElement>(null);
  const wasEditing = React.useRef(false);
  React.useEffect(() => {
    if (wasEditing.current && !showEditor) actionsRef.current?.querySelector("button")?.focus();
    wasEditing.current = showEditor;
  }, [showEditor]);
  // The visible label leads the accessible name; the file name keeps it unique per card.
  const named = (label: string) => (
    <>
      {label}
      <span className="sr-only">: {file.fileName}</span>
    </>
  );

  function edit(text: string) {
    setDraft(text);
    setEditing(true);
  }

  async function save() {
    if (!draft.trim()) return;
    setBusy("save");
    const result = await saveAnalysis(jobId, file.id, draft);
    setBusy(null);
    if (!result.ok) return void toast.error(result.message);
    setEditing(false);
    onChange(result.data);
  }

  async function again() {
    if (file.analysisEdited) {
      const replace = await askConfirm({
        title: "Replace your edited style guide?",
        description: "Analysing again replaces the style guide you edited with a new one from the AI.",
        confirmLabel: "Analyse again",
      });
      if (!replace) return;
    }
    setBusy("analyse");
    const result = await analyseAgain(jobId, file.id);
    setBusy(null);
    if (!result.ok) return void toast.error(result.message);
    setEditing(false);
    onChange(result.data);
  }

  async function remove() {
    const confirmed = await askConfirm({
      title: `Remove ${file.fileName}?`,
      description: "Skills you generate next won't use it. Versions you already generated keep their copy.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!confirmed) return;
    setBusy("remove");
    const result = await removeJobFile(jobId, file.id);
    setBusy(null);
    if (!result.ok) return void toast.error(result.message);
    onRemoved(file.id);
  }

  return (
    <article className="glass rounded-[1.75rem] p-5" aria-labelledby={headingId}>
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl",
            file.analysisStatus === "FAILED" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary",
          )}
        >
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id={headingId} className="truncate font-medium" title={file.fileName}>
            {file.fileName}
          </h3>
          <p className="text-xs tabular-nums text-muted-foreground">
            {KIND_LABEL[file.kind]} · {formatBytes(file.size)}
          </p>
        </div>
        {file.analysisEdited && ready && <Badge variant="secondary">Edited by you</Badge>}
      </div>

      {!file.bundlable && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-warning/10 px-3 py-2 text-xs text-pretty">
          <AlertTriangle className="mt-px size-3.5 shrink-0 text-warning" aria-hidden />
          Too large to bundle — the skill will use the analysis only.
        </p>
      )}

      {pending && (
        <p role="status" className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
          <span>
            <span className="font-medium text-foreground">Analysing…</span> The style guide appears here when it&apos;s ready.
          </span>
        </p>
      )}

      {showEditor && (
        <div className="mt-4">
          <Textarea
            aria-label={`Style guide for ${file.fileName}`}
            autoFocus
            value={draft}
            maxLength={JOB_LIMITS.analysisChars}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={"## Colours\n## Fonts\n## Layout\n## Structure\n## Tone and content"}
            className="min-h-64 resize-y bg-white/60 text-sm leading-relaxed dark:bg-white/5"
          />
          <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
            <span className="mr-auto text-xs tabular-nums text-muted-foreground">
              {draft.length.toLocaleString("en-US")} / {JOB_LIMITS.analysisChars.toLocaleString("en-US")}
            </span>
            <Button variant="ghost" className={ACTION} onClick={() => setEditing(false)} disabled={busy === "save"}>
              Cancel
            </Button>
            <Button className={ACTION} onClick={() => void save()} disabled={!draft.trim() || busy !== null}>
              {busy === "save" && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Save
            </Button>
          </div>
        </div>
      )}

      {!pending && !showEditor && ready && file.analysis && <SafeMarkdown className={cn("mt-4", PROSE)}>{file.analysis}</SafeMarkdown>}

      {!pending && !showEditor && file.analysisStatus === "FAILED" && (
        <p className="mt-4 flex max-w-prose items-start gap-2 text-sm text-pretty text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {file.analysisError ?? "We couldn't analyse this file. Try again, or write the style guide yourself."}
        </p>
      )}

      {!showEditor && (
        <div ref={actionsRef} className="mt-4 flex flex-wrap gap-2">
          {!pending &&
            (ready ? (
              <Button variant="outline" size="sm" className={ACTION} onClick={() => edit(file.analysis ?? "")} disabled={busy !== null}>
                <Pencil className="size-4" aria-hidden />
                {named("Edit")}
              </Button>
            ) : (
              <Button variant="outline" size="sm" className={ACTION} onClick={() => edit("")} disabled={busy !== null}>
                <PenLine className="size-4" aria-hidden />
                {named("Write it yourself")}
              </Button>
            ))}
          {!pending && (
            <Button variant="outline" size="sm" className={ACTION} onClick={() => void again()} disabled={!aiConfigured || busy !== null}>
              {busy === "analyse" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RotateCcw className="size-4" aria-hidden />}
              {named("Analyse again")}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className={cn(ACTION, "text-muted-foreground hover:text-destructive", !pending && "sm:ml-auto")}
            onClick={() => void remove()}
            disabled={busy !== null}
          >
            {busy === "remove" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
            {named("Remove")}
          </Button>
        </div>
      )}
    </article>
  );
}
