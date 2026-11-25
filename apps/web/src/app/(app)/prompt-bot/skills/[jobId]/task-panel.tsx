"use client";
import * as React from "react";
import type { Components } from "react-markdown";
import { Info, Loader2, Sparkles, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SafeMarkdown } from "@/components/prompt-bot/safe-markdown";
import { enhanceTask } from "@/lib/skills/jobs/client";
import { descriptionLength, tooShortMessage, wordCount } from "@/lib/skills/jobs/task-text";
import { JOB_LIMITS } from "@/lib/skills/limits";
import { cn } from "@/lib/utils";

const PLACEHOLDER =
  "What the work is for, when you do it, what you start from (files, data, notes), the steps you take, what you hand over and who reads it.";
const count = (n: number) => n.toLocaleString("en-US");

/** The id of the "at least 500 characters" message, for the controls it explains (Next, the step buttons). */
export const taskShortMessageId = (jobId: string) => `task-description-${jobId}-short`;

const COVERS: [string, string][] = [
  ["Purpose", "what the work is for"],
  ["When it's used", "what starts it, how often"],
  ["Same every time", "structure, template, standards, brand, tone"],
  ["Varies each time", "client, dates, scope, figures"],
  ["Steps", "in the order you do them"],
  ["Output", "what you hand over"],
  ["Who it's for", "who reads or uses it"],
  ["Quality bar", "how you know it's good"],
  ["Constraints", "what to avoid, limits, rules"],
];

/** The brief's sections sit under the panel's h3, so its Markdown headings render one level down. */
const BRIEF_HEADINGS: Components = {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- `node` is react-markdown's AST node, not a DOM prop.
  h1: ({ node, ...props }) => <h4 {...props} />,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- as above
  h2: ({ node, ...props }) => <h4 {...props} />,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- as above
  h3: ({ node, ...props }) => <h5 {...props} />,
};
const BRIEF_TYPE =
  "max-w-[72ch] text-sm leading-relaxed text-foreground/90 [&_h4]:mt-4 [&_h4]:font-semibold [&_h4]:text-foreground [&_h4:first-child]:mt-0 [&_h5]:mt-3 [&_h5]:font-medium [&_p]:mt-1 [&_ul]:mt-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mt-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:mt-0.5 [&_li]:marker:text-muted-foreground [&_em]:text-muted-foreground [&_strong]:font-semibold";

type Props = { jobId: string; description: string; aiConfigured: boolean; onDescriptionChange(value: string): void };

/**
 * Step 1. The workspace owns saving (debounced, flushed before AI calls, sent on page leave); this panel
 * owns Enhance: the suggested brief never replaces the text until the user picks Use this, and Undo
 * puts the previous text back until the next keystroke, the next Enhance or Keep mine.
 */
export function TaskPanel({ jobId, description, aiConfigured, onDescriptionChange }: Props) {
  const id = `task-description-${jobId}`;
  const shortId = taskShortMessageId(jobId);
  const boxRef = React.useRef<HTMLTextAreaElement>(null);
  const [running, setRunning] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [suggestion, setSuggestion] = React.useState<string | null>(null);
  const [undoText, setUndoText] = React.useState<string | null>(null);

  const length = descriptionLength(description);
  const short = length < JOB_LIMITS.descriptionMinChars;
  const canEnhance = aiConfigured && !running && wordCount(description) >= JOB_LIMITS.enhanceMinWords;

  async function enhance() {
    if (!canEnhance) return;
    setRunning(true);
    setError(null);
    setUndoText(null);
    setSuggestion(null);
    const result = await enhanceTask(jobId, description);
    setRunning(false);
    if (!result.ok) return setError(result.message);
    setSuggestion(result.data.brief);
  }

  function applySuggestion() {
    if (suggestion === null) return;
    setUndoText(description);
    setSuggestion(null);
    onDescriptionChange(suggestion);
    boxRef.current?.focus();
  }

  function keepMine() {
    setSuggestion(null);
    setUndoText(null);
    boxRef.current?.focus();
  }

  function undo() {
    if (undoText === null) return;
    onDescriptionChange(undoText);
    setUndoText(null);
    boxRef.current?.focus();
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <section className="glass min-w-0 rounded-[1.75rem] p-4 sm:p-5">
        <label htmlFor={id} className="text-sm font-medium">
          Describe the task
        </label>
        <p id={`${id}-help`} className="mt-1 text-xs text-pretty text-muted-foreground">
          One piece of work you repeat. The more you say, the sharper the questions and skills.
        </p>
        <Textarea
          id={id}
          ref={boxRef}
          value={description}
          maxLength={JOB_LIMITS.descriptionChars}
          onChange={(e) => {
            setUndoText(null);
            onDescriptionChange(e.target.value);
          }}
          placeholder={PLACEHOLDER}
          aria-describedby={[`${id}-help`, `${id}-count`, short ? shortId : ""].filter(Boolean).join(" ")}
          className="mt-3 min-h-64 resize-y bg-white/60 leading-relaxed dark:bg-white/5"
        />
        <div className="mt-2 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1 basis-52">
            {short && (
              <p id={shortId} className="flex items-start gap-1.5 text-xs text-pretty text-muted-foreground">
                <Info className="mt-px size-3.5 shrink-0 text-primary" aria-hidden />
                <span>{tooShortMessage(length)}</span>
              </p>
            )}
          </div>
          <p id={`${id}-count`} className={cn("shrink-0 text-xs tabular-nums", short ? "font-medium text-foreground" : "text-muted-foreground")}>
            {short ? `${count(length)} / ${count(JOB_LIMITS.descriptionMinChars)} minimum` : `${count(description.length)} / ${count(JOB_LIMITS.descriptionChars)}`}
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border/60 pt-4">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 sm:min-h-9"
            disabled={!canEnhance}
            aria-busy={running || undefined}
            aria-describedby={`${id}-enhance-help`}
            onClick={() => void enhance()}
          >
            {running ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Sparkles className="size-4 text-primary" aria-hidden />}
            {running ? "Enhancing…" : "Enhance"}
          </Button>
          <p id={`${id}-enhance-help`} className="min-w-0 flex-1 basis-48 text-xs text-pretty text-muted-foreground">
            {wordCount(description) < JOB_LIMITS.enhanceMinWords
              ? `Write at least ${JOB_LIMITS.enhanceMinWords} words, then Enhance turns them into a clear brief.`
              : "Turns your notes into a clear brief. You see it first and choose whether to use it."}
          </p>
        </div>
        <div aria-live="polite">
          {error && (
            <p role="alert" className="mt-3 text-sm text-pretty text-destructive">
              {error}
            </p>
          )}
          {undoText !== null && (
            <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-primary/5 px-3 py-2 text-sm">
              <span>Replaced with the suggested brief.</span>
              <Button type="button" variant="ghost" size="sm" className="min-h-11 px-2 sm:min-h-8" onClick={undo}>
                <Undo2 className="size-4" aria-hidden />
                Undo
              </Button>
            </p>
          )}
        </div>

        {suggestion !== null && (
          <section aria-labelledby={`${id}-brief`} className="mt-4 rounded-2xl border border-primary/20 bg-primary/5 p-4 dark:bg-primary/10">
            <h3 id={`${id}-brief`} className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="size-4 text-primary" aria-hidden />
              Suggested brief
            </h3>
            <SafeMarkdown className={cn("mt-3", BRIEF_TYPE)} components={BRIEF_HEADINGS}>
              {suggestion}
            </SafeMarkdown>
            <p className="mt-3 text-xs text-pretty text-muted-foreground">Italic questions mark gaps. Answer them here or in the Questions step.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" className="min-h-11 sm:min-h-9" onClick={applySuggestion}>
                Use this
              </Button>
              <Button type="button" variant="ghost" className="min-h-11 sm:min-h-9" onClick={keepMine}>
                Keep mine
              </Button>
            </div>
          </section>
        )}
      </section>

      <aside className="glass h-fit rounded-[1.75rem] p-4 text-sm sm:p-5" aria-labelledby={`${id}-covers`}>
        <h2 id={`${id}-covers`} className="font-semibold">
          A good brief covers
        </h2>
        <ul className="mt-3 flex flex-col gap-2">
          {COVERS.map(([term, gloss]) => (
            <li key={term} className="leading-snug">
              <span className="font-medium">{term}</span>
              <span className="block text-xs text-muted-foreground">{gloss}</span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
