"use client";
import * as React from "react";
import { AlertTriangle, Loader2, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, type ConfirmDialogHandle } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { SaveOptions } from "@/lib/prompt-bot/client";
import { generateJobSkill, patchJobSkill, removeJobSkill } from "@/lib/skills/jobs/client";
import type { JobFileView, JobSkillView } from "@/lib/skills/jobs/types";
import { JOB_LIMITS } from "@/lib/skills/limits";
import { cn } from "@/lib/utils";
import { VersionPreview } from "./version-preview";

const INLINE_NAME_ERRORS = new Set(["DUPLICATE_NAME", "ALREADY_GENERATING", "VALIDATION_ERROR"]);

export const unansweredPhrase = (gaps: number) => `${gaps} question${gaps === 1 ? "" : "s"} unanswered`;

/** The workspace's save queue (useMatrixAnswers): debounced per key, sent on Suggest, Generate and when the page is left. */
export type QueueSave = (key: string, run: (options: SaveOptions) => Promise<void>) => void;

type Props = {
  jobId: string;
  skill: JobSkillView;
  files: JobFileView[];
  gaps: number;
  aiConfigured: boolean;
  flushSaves(): Promise<void>;
  queueSave: QueueSave;
  onChange(skill: JobSkillView): void;
  onRemoved(skillId: string): void;
};

/** One skill: name, purpose, files, status, Generate, then its versions. */
export function SkillCard({ jobId, skill, files, gaps, aiConfigured, flushSaves, queueSave, onChange, onRemoved }: Props) {
  const [name, setName] = React.useState(skill.name);
  const [nameError, setNameError] = React.useState<string | null>(null);
  const [purpose, setPurpose] = React.useState(skill.purpose);
  const [busy, setBusy] = React.useState<"generate" | "remove" | null>(null);
  const confirmRef = React.useRef<ConfirmDialogHandle>(null);
  // File chips show the latest choice at once. Their PATCHes go one at a time, in click order, and
  // only the last reply is handed to the page, so quick clicks never undo each other.
  const [chosenFiles, setChosenFiles] = React.useState<string[] | null>(null);
  const chosenRef = React.useRef<string[] | null>(null);
  const fileSaves = React.useRef<{ tail: Promise<void>; ticket: number; saved: JobSkillView | null }>({ tail: Promise.resolve(), ticket: 0, saved: null });
  const fileIds = chosenFiles ?? skill.fileIds;
  const generating = skill.status === "GENERATING";
  const latest = skill.versions[0] ?? null;
  const renamed = skill.latestVersion > 0 && latest !== null && latest.name !== skill.name;
  const ids = {
    name: `skill-name-${skill.id}`,
    nameError: `skill-name-error-${skill.id}`,
    purpose: `skill-purpose-${skill.id}`,
  };

  function updatePurpose(value: string) {
    setPurpose(value);
    // A blank purpose is never sent; queueing a no-op drops an earlier value still waiting.
    queueSave(`skill:${skill.id}:purpose`, async (options) => {
      if (!value.trim()) return;
      const result = await patchJobSkill(jobId, skill.id, { purpose: value }, options);
      if (!result.ok) toast.error(result.message);
      else onChange(result.data);
    });
  }

  async function saveName() {
    const value = name.trim();
    if (!value || value === skill.name) {
      setName(skill.name);
      setNameError(null);
      return;
    }
    const result = await patchJobSkill(jobId, skill.id, { name: value });
    if (!result.ok) {
      if (INLINE_NAME_ERRORS.has(result.code)) setNameError(result.message);
      else {
        toast.error(result.message);
        setName(skill.name);
      }
      return;
    }
    setNameError(null);
    setName(result.data.name);
    onChange(result.data);
  }

  function toggleFile(fileId: string) {
    const current = chosenRef.current ?? skill.fileIds;
    const next = current.includes(fileId) ? current.filter((id) => id !== fileId) : [...current, fileId];
    chosenRef.current = next;
    setChosenFiles(next);
    const saves = fileSaves.current;
    const ticket = ++saves.ticket;
    saves.tail = saves.tail.then(async () => {
      const result = await patchJobSkill(jobId, skill.id, { fileIds: next });
      if (result.ok) saves.saved = result.data;
      else toast.error(result.message);
      if (ticket !== saves.ticket) return;
      // The last click has its reply: show what the server kept (the last accepted change).
      chosenRef.current = null;
      setChosenFiles(null);
      if (saves.saved) onChange(saves.saved);
      saves.saved = null;
    });
  }

  async function generate() {
    // The only question Generate asks: a new version never replaces an older one.
    if (gaps > 0) {
      const confirmed = await confirmRef.current?.open({
        title: `${unansweredPhrase(gaps)} — the skill will be more general. Generate anyway?`,
        confirmLabel: "Generate anyway",
      });
      if (!confirmed) return;
    }
    setBusy("generate");
    await flushSaves();
    await fileSaves.current.tail;
    const result = await generateJobSkill(jobId, skill.id);
    setBusy(null);
    if (!result.ok) return void toast.error(result.message);
    onChange(result.data);
  }

  async function remove() {
    const confirmed = await confirmRef.current?.open({
      title: `Remove ${skill.name}?`,
      description: "This deletes all its versions.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!confirmed) return;
    setBusy("remove");
    const result = await removeJobSkill(jobId, skill.id);
    setBusy(null);
    if (!result.ok) return void toast.error(result.message);
    onRemoved(skill.id);
  }

  return (
    <article className="glass rounded-[1.75rem] p-5" aria-label={`Skill ${skill.name}`}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <label htmlFor={ids.name} className="sr-only">
            {`Skill name: ${skill.name}`}
          </label>
          <Input
            id={ids.name}
            value={name}
            maxLength={JOB_LIMITS.skillNameChars}
            disabled={generating}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? ids.nameError : undefined}
            onChange={(e) => {
              setName(e.target.value);
              setNameError(null);
            }}
            onBlur={() => void saveName()}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className="min-h-11 bg-white/60 font-mono text-base font-semibold dark:bg-white/5 sm:min-h-9"
          />
          {nameError && (
            <p id={ids.nameError} aria-live="polite" className="mt-1.5 text-xs text-destructive">
              {nameError}
            </p>
          )}
        </div>
        {generating ? null : skill.status === "READY" ? (
          <Badge variant="success" className="mt-2.5">
            v{skill.latestVersion} ready
          </Badge>
        ) : skill.status === "DRAFT" ? (
          <Badge variant="secondary" className="mt-2.5">
            Draft
          </Badge>
        ) : null}
      </div>

      <label htmlFor={ids.purpose} className="mt-4 block text-sm font-medium">
        Purpose<span className="sr-only">: {skill.name}</span>
      </label>
      <Textarea
        id={ids.purpose}
        value={purpose}
        maxLength={JOB_LIMITS.skillPurposeChars}
        disabled={generating}
        onChange={(e) => updatePurpose(e.target.value)}
        className="mt-2 min-h-20 bg-white/60 dark:bg-white/5"
      />

      <fieldset className="mt-4">
        <legend className="text-sm font-medium">Files this skill uses</legend>
        {files.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">No files in this job yet. Add some in Files.</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {files.map((f) => {
              const on = fileIds.includes(f.id);
              return (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={on}
                  disabled={generating}
                  onClick={() => void toggleFile(f.id)}
                  className={cn(
                    "min-h-11 max-w-full truncate rounded-full px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50 sm:min-h-9",
                    on
                      ? "bg-primary/10 text-primary ring-1 ring-primary/30"
                      : "bg-white/55 text-muted-foreground ring-1 ring-border/60 hover:text-foreground dark:bg-white/5",
                  )}
                >
                  {f.fileName}
                </button>
              );
            })}
          </div>
        )}
      </fieldset>

      {generating && (
        <p role="status" className="mt-4 flex items-center gap-2 rounded-xl bg-primary/5 px-3 py-2 text-sm">
          <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
          Writing… (this can take a minute or two)
        </p>
      )}
      {!generating && skill.status === "FAILED" && (
        <div role="alert" className="mt-4 rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4" aria-hidden />
            Last attempt failed
          </p>
          {skill.validationErrors.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 break-words">
              {skill.validationErrors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          {skill.latestVersion > 0 && <p className="mt-2 text-foreground">v{skill.latestVersion} is still available.</p>}
        </div>
      )}
      {renamed && <p className="mt-3 text-xs text-muted-foreground">Renamed — generate again to use the new name</p>}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="min-h-11 text-muted-foreground hover:text-destructive sm:min-h-8"
          disabled={generating || busy !== null}
          onClick={() => void remove()}
        >
          <Trash2 className="size-4" aria-hidden />
          Remove<span className="sr-only">: {skill.name}</span>
        </Button>
        <Button
          size="lg"
          disabled={generating || busy !== null || !aiConfigured || nameError !== null}
          aria-describedby={nameError ? ids.nameError : undefined}
          onClick={() => void generate()}
        >
          {busy === "generate" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Wand2 className="size-4" aria-hidden />}
          {skill.latestVersion === 0 ? "Generate" : `Generate v${skill.latestVersion + 1}`}
          <span className="sr-only">: {skill.name}</span>
        </Button>
      </div>

      {skill.versions.length > 0 && <VersionPreview jobId={jobId} skill={skill} />}
      <ConfirmDialog ref={confirmRef} />
    </article>
  );
}
