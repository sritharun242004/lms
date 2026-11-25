"use client";
import * as React from "react";
import { Loader2, MessageCircleQuestion, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addQuestion, deleteQuestion, patchQuestion } from "@/lib/skills/jobs/client";
import type { QuestionInput, TaskQuestionView } from "@/lib/skills/jobs/types";
import { JOB_LIMITS } from "@/lib/skills/limits";

const HELP = "These change every time — client names, dates, figures. Don't answer them here: your skill will ask for them at the start of every run.";
const EMPTY = "Nothing varies between uses yet. Add an input if Claude should ask for something each time.";
const ICON_BUTTON = "size-11 shrink-0 text-muted-foreground hover:text-foreground sm:size-9";

type Props = {
  jobId: string;
  /** The PER_USE rows, in order. */
  inputs: TaskQuestionView[];
  /** A saved row: updated in place, added, or moved to "Answer now" (kind FIXED). */
  onQuestionChange(question: TaskQuestionView): void;
  onQuestionRemoved(questionId: string): void;
};

/** "Claude will ask each time": per-use inputs are never answered here; the skill asks for them on every run. */
export function PerUseList({ jobId, inputs, onQuestionChange, onQuestionRemoved }: Props) {
  const headingId = React.useId();
  const [adding, setAdding] = React.useState(false);
  const addRef = React.useRef<HTMLButtonElement>(null);
  const full = inputs.length >= JOB_LIMITS.perUseInputsPerTask;

  function closeAdd() {
    setAdding(false);
    // The form unmounts with focus inside it: hand focus back to the button that opened it.
    requestAnimationFrame(() => addRef.current?.focus());
  }

  return (
    <section className="glass rounded-[1.75rem] p-4 sm:p-5" aria-labelledby={headingId}>
      <h2 id={headingId} className="flex items-center gap-2 text-lg font-semibold">
        <MessageCircleQuestion className="size-5 text-primary" aria-hidden />
        Claude will ask each time
      </h2>
      <p className="mt-1 max-w-[72ch] text-sm text-pretty text-muted-foreground">{HELP}</p>

      {inputs.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-border/70 px-4 py-6 text-center text-sm text-pretty text-muted-foreground">{EMPTY}</p>
      ) : (
        <ul className="mt-4 flex flex-col divide-y divide-border/60" aria-label="Inputs Claude asks for">
          {inputs.map((q) => (
            <PerUseRow key={q.id} jobId={jobId} input={q} onChange={onQuestionChange} onRemoved={onQuestionRemoved} />
          ))}
        </ul>
      )}

      {adding ? (
        <AddInputForm
          onCancel={closeAdd}
          onSubmit={async (value) => {
            const result = await addQuestion(jobId, value);
            if (!result.ok) return result.message;
            onQuestionChange(result.data);
            closeAdd();
            return null;
          }}
        />
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button ref={addRef} type="button" variant="outline" className="min-h-11 sm:min-h-9" disabled={full} onClick={() => setAdding(true)}>
            <Plus className="size-4" aria-hidden />
            Add input
          </Button>
          {full && <p className="text-xs text-muted-foreground">A task can have at most {JOB_LIMITS.perUseInputsPerTask} inputs Claude asks for each time.</p>}
        </div>
      )}
    </section>
  );
}

type RowProps = { jobId: string; input: TaskQuestionView; onChange(q: TaskQuestionView): void; onRemoved(id: string): void };

function PerUseRow({ jobId, input, onChange, onRemoved }: RowProps) {
  const id = React.useId();
  const [label, setLabel] = React.useState(input.text);
  const [hint, setHint] = React.useState(input.guidance);
  const [seen, setSeen] = React.useState({ text: input.text, guidance: input.guidance });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // A newer saved copy (this row's own save, or a regeneration) replaces the drafts.
  if (seen.text !== input.text || seen.guidance !== input.guidance) {
    setSeen({ text: input.text, guidance: input.guidance });
    setLabel(input.text);
    setHint(input.guidance);
  }

  async function save(patch: Partial<QuestionInput>, revert: () => void): Promise<TaskQuestionView | null> {
    setBusy(true);
    setError(null);
    const result = await patchQuestion(jobId, input.id, patch);
    setBusy(false);
    if (!result.ok) {
      revert();
      setError(result.message);
      return null;
    }
    onChange(result.data);
    return result.data;
  }

  function saveLabel() {
    const value = label.trim();
    if (!value || value === input.text) return setLabel(input.text);
    void save({ text: value }, () => setLabel(input.text));
  }
  function saveHint() {
    const value = hint.trim();
    if (value === input.guidance) return setHint(input.guidance);
    void save({ guidance: value }, () => setHint(input.guidance));
  }
  async function remove() {
    setBusy(true);
    setError(null);
    const result = await deleteQuestion(jobId, input.id);
    setBusy(false);
    if (!result.ok) return setError(result.message);
    onRemoved(input.id);
  }

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:items-center">
        <Input
          aria-label="Input name"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          value={label} maxLength={JOB_LIMITS.perUseLabelChars} onChange={(e) => setLabel(e.target.value)} onBlur={saveLabel} className="font-medium" />
        <Input
          aria-label={`Hint for ${input.text}`}
          placeholder="Hint or example, optional"
          value={hint}
          maxLength={JOB_LIMITS.questionGuidanceChars}
          onChange={(e) => setHint(e.target.value)}
          onBlur={saveHint}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <div className="flex items-center gap-1">
          <label htmlFor={`${id}-required`} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-2 text-sm sm:min-h-9">
            <input
              id={`${id}-required`}
              type="checkbox"
              checked={input.required}
              disabled={busy}
              onChange={() => void save({ required: !input.required }, () => {})}
              className="size-4 accent-primary"
            />
            Required<span className="sr-only">: {input.text}</span>
          </label>
          <Button type="button" variant="ghost" size="icon" className={`${ICON_BUTTON} hover:text-destructive`} disabled={busy} aria-label={`Remove ${input.text}`} title="Remove" onClick={() => void remove()}>
            {busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <X className="size-4" aria-hidden />}
          </Button>
        </div>
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs text-pretty text-destructive">
          {error}
        </p>
      )}
    </li>
  );
}

type AddProps = { onSubmit(input: QuestionInput): Promise<string | null>; onCancel(): void };

function AddInputForm({ onSubmit, onCancel }: AddProps) {
  const id = React.useId();
  const [label, setLabel] = React.useState("");
  const [hint, setHint] = React.useState("");
  const [required, setRequired] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!label.trim() || saving) return;
    setSaving(true);
    setError(null);
    const message = await onSubmit({ text: label.trim(), guidance: hint.trim(), kind: "PER_USE", required });
    setSaving(false);
    if (message) setError(message);
  }

  return (
    <form
      aria-label="Add an input"
      onSubmit={(e) => void submit(e)}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
      className="mt-4 rounded-2xl bg-black/[0.03] p-3 dark:bg-white/5"
    >
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:items-center">
        <Input aria-label="New input name" autoFocus placeholder="e.g. Client name" value={label} maxLength={JOB_LIMITS.perUseLabelChars} onChange={(e) => setLabel(e.target.value)} />
        <Input aria-label="Hint for the new input" placeholder="Hint or example, optional" value={hint} maxLength={JOB_LIMITS.questionGuidanceChars} onChange={(e) => setHint(e.target.value)} />
        <label htmlFor={`${id}-required`} className="flex min-h-11 cursor-pointer items-center gap-2 px-2 text-sm sm:min-h-9">
          <input id={`${id}-required`} type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} className="size-4 accent-primary" />
          Required <span className="sr-only">for the new input</span>
        </label>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-pretty text-destructive">
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" className="min-h-11 sm:min-h-9" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" className="min-h-11 sm:min-h-9" disabled={!label.trim() || saving}>
          {saving && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />}
          Save input
        </Button>
      </div>
    </form>
  );
}
