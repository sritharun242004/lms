"use client";
import * as React from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, type ConfirmDialogHandle } from "@/components/ui/confirm-dialog";
import type { JobFileView } from "@/lib/skills/jobs/types";
import { JOB_LIMITS } from "@/lib/skills/limits";
import { cn } from "@/lib/utils";
import { FILE_ACCEPT, FILE_MB, FileCard, UploadRows, useUploadQueue, type AskConfirm } from "./file-card";

export { FILE_ACCEPT };

type Props = { jobId: string; files: JobFileView[]; aiConfigured: boolean; onFileChange(file: JobFileView): void; onFileRemoved(fileId: string): void };

/** Step 2: uploads (one at a time, in the order chosen) and each file's analysis, editable by the user. */
export function FilesPanel({ jobId, files, aiConfigured, onFileChange, onFileRemoved }: Props) {
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const confirmRef = React.useRef<ConfirmDialogHandle>(null);
  const { rows, enqueue, dismiss } = useUploadQueue({ jobId, enabled: aiConfigured, onFileChange });
  const askConfirm: AskConfirm = React.useCallback((options) => confirmRef.current?.open(options) ?? Promise.resolve(false), []);

  return (
    <section className="flex flex-col gap-4" aria-labelledby="files-heading">
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
          "glass flex flex-col items-center gap-3 rounded-[1.75rem] border-2 border-dashed border-primary/25! px-5 py-8 text-center transition-colors sm:py-10",
          dragging && "border-primary! bg-primary/5",
        )}
      >
        <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Upload className="size-5" aria-hidden />
        </span>
        <h2 id="files-heading" className="text-lg font-semibold text-balance">
          Files you use for this job
        </h2>
        <p className="max-w-md text-sm text-pretty text-muted-foreground">
          Add your templates, past examples and reference documents. Each one is analysed into a style guide you can edit.
        </p>
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
        <Button size="lg" className="mt-1 min-h-11" disabled={!aiConfigured} onClick={() => inputRef.current?.click()}>
          <Upload className="size-4" aria-hidden />
          Upload files
        </Button>
        <p className="text-xs text-muted-foreground">
          <span className="hidden sm:inline">Or drop them here. </span>
          PowerPoint, Word, Excel, PDF, PNG or JPG · up to {FILE_MB} MB each · {JOB_LIMITS.filesPerJob} files
        </p>
      </div>

      {rows.length > 0 && <UploadRows rows={rows} onDismiss={dismiss} />}

      {files.length === 0 && rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border/70 px-4 py-8 text-center text-sm text-pretty text-muted-foreground">No files yet. Add the decks, documents and sheets you use for this job. Skip this step if you have none.</p>
      ) : (
        <ul className="flex flex-col gap-4" aria-label="Files">
          {files.map((f) => (
            <li key={f.id}>
              <FileCard jobId={jobId} file={f} aiConfigured={aiConfigured} askConfirm={askConfirm} onChange={onFileChange} onRemoved={onFileRemoved} />
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog ref={confirmRef} />
    </section>
  );
}
