"use client";
import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FILE_HINTS, type FileHint, type QuestionInput, type TaskQuestionView } from "@/lib/skills/jobs/types";
import { JOB_LIMITS } from "@/lib/skills/limits";
import { HINT_LABEL } from "./question-files";

type Props = {
  /** The question being edited; absent when adding one. */
  question?: TaskQuestionView;
  /** Saves; resolves to the server's message when it failed, else null. */
  onSubmit(input: Required<Pick<QuestionInput, "text" | "guidance" | "wantsFiles" | "fileHint" | "fileNote">>): Promise<string | null>;
  onCancel(): void;
};

const SELECT =
  "flex h-11 w-full rounded-2xl border border-transparent bg-input px-4 text-base outline-none focus-visible:border-primary/20 focus-visible:ring-3 focus-visible:ring-ring/15 md:text-sm dark:bg-input/30";

/** Adds or edits an "Answer now" question in place of the answer card. */
export function QuestionEditor({ question, onSubmit, onCancel }: Props) {
  const id = React.useId();
  const editing = question !== undefined;
  const [text, setText] = React.useState(question?.text ?? "");
  const [guidance, setGuidance] = React.useState(question?.guidance ?? "");
  const [wantsFiles, setWantsFiles] = React.useState(question?.wantsFiles ?? false);
  const [fileHint, setFileHint] = React.useState<FileHint>(question?.fileHint ?? "REFERENCE");
  const [fileNote, setFileNote] = React.useState(question?.fileNote ?? "");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const canSave = text.trim() !== "" && !saving;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const message = await onSubmit({
      text: text.trim(),
      guidance: guidance.trim(),
      wantsFiles,
      fileHint: wantsFiles ? fileHint : null,
      fileNote: wantsFiles ? fileNote.trim() : "",
    });
    setSaving(false);
    if (message) setError(message);
  }

  return (
    <form
      aria-label={editing ? "Edit question" : "Add a question"}
      onSubmit={(e) => void save(e)}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
      className="flex flex-col gap-4"
    >
      <h2 className="text-base font-semibold">{editing ? "Edit question" : "Add a question"}</h2>
      <div>
        <label htmlFor={`${id}-text`} className="text-sm font-medium">
          Question
        </label>
        <Textarea
          id={`${id}-text`}
          autoFocus
          required
          value={text}
          maxLength={JOB_LIMITS.questionTextChars}
          onChange={(e) => setText(e.target.value)}
          placeholder="One thing Claude should know, as you'd ask a colleague."
          className="mt-1.5 min-h-20 resize-y bg-white/60 dark:bg-white/5"
        />
      </div>
      <div>
        <label htmlFor={`${id}-guidance`} className="text-sm font-medium">
          What a good answer includes
        </label>
        <span className="ml-1.5 text-xs text-muted-foreground">optional</span>
        <Input
          id={`${id}-guidance`}
          value={guidance}
          maxLength={JOB_LIMITS.questionGuidanceChars}
          onChange={(e) => setGuidance(e.target.value)}
          placeholder="Shown as the hint in the answer box."
          className="mt-1.5"
        />
      </div>
      <div className="rounded-2xl bg-black/[0.03] p-3 dark:bg-white/5">
        <div className="flex min-h-11 items-center gap-3">
          <input
            id={`${id}-files`}
            type="checkbox"
            checked={wantsFiles}
            onChange={(e) => setWantsFiles(e.target.checked)}
            aria-describedby={`${id}-files-note`}
            className="size-5 shrink-0 accent-primary"
          />
          <label htmlFor={`${id}-files`} className="text-sm font-medium">
            Highlight the upload for this question
          </label>
        </div>
        <p id={`${id}-files-note`} className="text-xs text-pretty text-muted-foreground">
          Every question can take files. Highlight the upload when a file answers it better than words.
        </p>
        {wantsFiles && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={`${id}-hint`} className="text-sm font-medium">
                Kind of file
              </label>
              <select id={`${id}-hint`} value={fileHint} onChange={(e) => setFileHint(e.target.value as FileHint)} className={`mt-1.5 ${SELECT}`}>
                {FILE_HINTS.map((h) => (
                  <option key={h} value={h}>
                    {HINT_LABEL[h]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${id}-note`} className="text-sm font-medium">
                What to upload
              </label>
              <Input
                id={`${id}-note`}
                value={fileNote}
                maxLength={JOB_LIMITS.fileNoteChars}
                onChange={(e) => setFileNote(e.target.value)}
                placeholder="e.g. Upload your logo and brand colours."
                className="mt-1.5"
              />
            </div>
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-pretty text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" className="min-h-11 sm:min-h-9" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" className="min-h-11 sm:min-h-9" disabled={!canSave}>
          {saving && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />}
          {editing ? "Save question" : "Add question"}
        </Button>
      </div>
    </form>
  );
}
