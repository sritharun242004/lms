"use client";
import * as React from "react";
import { Loader2, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, type ConfirmDialogHandle } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { addJobSkill, suggestSkills } from "@/lib/skills/jobs/client";
import type { JobSkillView, JobView } from "@/lib/skills/jobs/types";
import { JOB_LIMITS } from "@/lib/skills/limits";
import { SkillCard, unansweredPhrase, type QueueSave } from "./skill-card";

const INLINE_ADD_ERRORS = new Set(["DUPLICATE_NAME", "TOO_MANY_SKILLS", "VALIDATION_ERROR"]);
const REPLACES_DRAFTS = "This replaces the skills you haven't generated yet.";

type Props = {
  job: JobView;
  gaps: number;
  aiConfigured: boolean;
  flushSaves(): Promise<void>;
  /** The workspace's save queue: a skill's purpose autosaves through it, so leaving the page or Suggest sends it. */
  queueSave: QueueSave;
  onJobChange(job: JobView): void;
  onSkillChange(skill: JobSkillView): void;
  onSkillRemoved(skillId: string): void;
};

type SuggestQuestion = { title: string; description?: string; confirmLabel: string };

/**
 * The one question Suggest asks, or null to suggest at once. Unanswered questions
 * make suggestions more general; drafts (never-generated skills) are replaced, and
 * the client can't tell an edited draft from an untouched one, so drafts always ask.
 */
function suggestQuestion(gaps: number, drafts: number): SuggestQuestion | null {
  if (gaps > 0) {
    return {
      title: `${unansweredPhrase(gaps)} — your skills will be more general. Create them anyway?`,
      ...(drafts > 0 ? { description: REPLACES_DRAFTS } : {}),
      confirmLabel: "Create anyway",
    };
  }
  if (drafts > 0) return { title: "Replace your draft skills?", description: `${REPLACES_DRAFTS} Skills with versions are kept.`, confirmLabel: "Replace drafts" };
  return null;
}

/** Step 4: suggested and added skills, each generated into versions. */
export function SkillsPanel({ job, gaps, aiConfigured, flushSaves, queueSave, onJobChange, onSkillChange, onSkillRemoved }: Props) {
  const [suggesting, setSuggesting] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [name, setName] = React.useState("");
  const [purpose, setPurpose] = React.useState("");
  const [addError, setAddError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const confirmRef = React.useRef<ConfirmDialogHandle>(null);
  // Each card's file-chip saves, so Suggest reads the files the user chose, not the ones before a click.
  const fileSaves = React.useRef(new Map<string, () => Promise<void>>());
  const registerFileSaves = React.useCallback((skillId: string, pending: () => Promise<void>) => {
    fileSaves.current.set(skillId, pending);
    return () => {
      if (fileSaves.current.get(skillId) === pending) fileSaves.current.delete(skillId);
    };
  }, []);
  const drafts = job.skills.filter((s) => s.latestVersion === 0).length;
  const full = job.skills.length >= JOB_LIMITS.skillsPerJob;
  const hasSkills = job.skills.length > 0;

  async function suggest() {
    const question = suggestQuestion(gaps, drafts);
    if (question && !(await confirmRef.current?.open(question))) return;
    setSuggesting(true);
    await flushSaves();
    await Promise.all([...fileSaves.current.values()].map((pending) => pending()));
    const result = await suggestSkills(job.id);
    setSuggesting(false);
    if (!result.ok) return void toast.error(result.message);
    onJobChange(result.data);
  }

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || !purpose.trim() || saving) return;
    setSaving(true);
    const result = await addJobSkill(job.id, { name, purpose });
    setSaving(false);
    if (!result.ok) {
      if (INLINE_ADD_ERRORS.has(result.code)) setAddError(result.message);
      else toast.error(result.message);
      return;
    }
    setName("");
    setPurpose("");
    setAddError(null);
    setAdding(false);
    onSkillChange(result.data);
  }

  function closeAdd() {
    setAdding(false);
    setAddError(null);
  }

  const suggestButton = (
    <Button size="lg" variant={hasSkills ? "outline" : "default"} disabled={!aiConfigured || suggesting} onClick={() => void suggest()}>
      {suggesting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
      {suggesting ? "Drafting your skills…" : hasSkills ? "Redraft my skills" : "Create my skills"}
    </Button>
  );

  return (
    <section className="flex flex-col gap-4" aria-labelledby="skills-heading">
      {hasSkills ? (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 id="skills-heading" className="text-lg font-semibold text-balance">
              Skills for this job
            </h2>
            <p className="text-sm text-muted-foreground">Rename, remove or add skills, choose their files, then generate each one.</p>
          </div>
          <div className="flex flex-col items-start gap-1 sm:items-end">
            {suggestButton}
            <span className="text-xs text-muted-foreground">Keeps skills you&apos;ve generated and replaces the drafts.</span>
          </div>
        </div>
      ) : (
        <div className="glass flex flex-col items-center gap-3 rounded-[1.75rem] px-5 py-8 text-center sm:py-10">
          <h2 id="skills-heading" className="text-lg font-semibold text-balance">
            Your skills
          </h2>
          <p className="max-w-md text-sm text-muted-foreground">Turn this job into your own skills.</p>
          <p className="max-w-md text-xs text-muted-foreground">The AI drafts new skills from your job, files and answers — nothing is copied from public or existing skills. Usually one skill; more only when the job has clearly separate parts.</p>
          {suggestButton}
        </div>
      )}

      {hasSkills && (
        <ul className="flex flex-col gap-4">
          {job.skills.map((s) => (
            <li key={s.id}>
              <SkillCard
                jobId={job.id}
                skill={s}
                files={job.files}
                gaps={gaps}
                aiConfigured={aiConfigured}
                flushSaves={flushSaves}
                queueSave={queueSave}
                onChange={onSkillChange}
                onRemoved={onSkillRemoved}
                registerFileSaves={registerFileSaves}
              />
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <form onSubmit={add} className="glass rounded-[1.75rem] p-5" aria-label="Add a skill">
          <label htmlFor="new-skill-name" className="text-sm font-medium">
            New skill name
          </label>
          <Input
            id="new-skill-name"
            autoFocus
            value={name}
            maxLength={JOB_LIMITS.skillNameChars}
            onChange={(e) => {
              setName(e.target.value);
              setAddError(null);
            }}
            placeholder="e.g. Weekly report"
            aria-invalid={addError ? true : undefined}
            aria-describedby={addError ? "new-skill-error" : undefined}
            className="mt-2 min-h-11 bg-white/60 font-mono dark:bg-white/5 sm:min-h-9"
          />
          <label htmlFor="new-skill-purpose" className="mt-4 block text-sm font-medium">
            What it does
          </label>
          <Textarea
            id="new-skill-purpose"
            value={purpose}
            maxLength={JOB_LIMITS.skillPurposeChars}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="One sentence: what it produces and when it is used."
            className="mt-2 min-h-20 bg-white/60 dark:bg-white/5"
          />
          {addError && (
            <p id="new-skill-error" aria-live="polite" className="mt-2 text-sm text-destructive">
              {addError}
            </p>
          )}
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" size="lg" onClick={closeAdd}>
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={!name.trim() || !purpose.trim() || saving}>
              {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Add
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col items-start gap-1">
          <Button variant="outline" size="lg" disabled={full} aria-describedby={full ? "skills-full-note" : undefined} onClick={() => setAdding(true)}>
            <Plus className="size-4" aria-hidden />
            Add skill
          </Button>
          {full && <span id="skills-full-note" className="text-xs text-muted-foreground">{`A job can have at most ${JOB_LIMITS.skillsPerJob} skills.`}</span>}
        </div>
      )}
      <ConfirmDialog ref={confirmRef} />
    </section>
  );
}
