"use client";
import * as React from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { addJobSkill } from "@/lib/skills/jobs/client";
import type { JobSkillView } from "@/lib/skills/jobs/types";
import { JOB_LIMITS } from "@/lib/skills/limits";

const INLINE_ADD_ERRORS = new Set(["DUPLICATE_NAME", "TOO_MANY_SKILLS", "VALIDATION_ERROR"]);
export const SUB_SKILLS_FULL = `A plugin can have at most ${JOB_LIMITS.subSkillsMax} sub-skills.`;

type Props = { jobId: string; full: boolean; locked: boolean; onAdded(skill: JobSkillView): void };

/** Adds a sub-skill by hand; the server appends it last in the workflow. */
export function AddSubSkill({ jobId, full, locked, onAdded }: Props) {
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ name: "", label: "", purpose: "", step: "" });
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const ready = form.name.trim() !== "" && form.purpose.trim() !== "";
  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    if (field === "name") setError(null);
  };

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!ready || saving) return;
    setSaving(true);
    const label = form.label.trim();
    const step = form.step.trim();
    const result = await addJobSkill(jobId, { name: form.name, purpose: form.purpose, ...(label ? { label } : {}), ...(step ? { step } : {}) });
    setSaving(false);
    if (!result.ok) {
      if (INLINE_ADD_ERRORS.has(result.code)) setError(result.message);
      else toast.error(result.message);
      return;
    }
    setForm({ name: "", label: "", purpose: "", step: "" });
    setError(null);
    setOpen(false);
    onAdded(result.data);
  }

  if (!open) {
    return (
      <div className="ml-3 flex flex-col items-start gap-1 sm:ml-6">
        <Button variant="outline" size="lg" disabled={full || locked} aria-describedby={full ? "sub-skills-full-note" : undefined} onClick={() => setOpen(true)}>
          <Plus className="size-4" aria-hidden />
          Add sub-skill
        </Button>
        {full && (
          <span id="sub-skills-full-note" className="text-xs text-muted-foreground">
            {SUB_SKILLS_FULL}
          </span>
        )}
      </div>
    );
  }

  const field = "mt-1.5 bg-white/60 dark:bg-white/5";
  const label = "mt-4 block text-sm font-medium";
  return (
    <form onSubmit={add} className="glass ml-3 rounded-[1.75rem] p-4 sm:ml-6 sm:p-5" aria-label="Add a sub-skill">
      <p className="text-xs text-pretty text-muted-foreground">It goes last in the main skill&apos;s workflow. Move it up or down after adding it.</p>
      <div className="grid gap-x-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)]">
        <div className="min-w-0">
          <label htmlFor="new-skill-name" className={label}>
            New sub-skill name
          </label>
          <Input
            id="new-skill-name"
            autoFocus
            value={form.name}
            maxLength={JOB_LIMITS.skillNameChars}
            spellCheck={false}
            onChange={set("name")}
            placeholder="e.g. deck-formatter"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "new-skill-error" : undefined}
            className={`${field} min-h-11 font-mono sm:min-h-9`}
          />
        </div>
        <div className="min-w-0">
          <label htmlFor="new-skill-label" className={label}>
            Label <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <Input id="new-skill-label" value={form.label} maxLength={JOB_LIMITS.skillLabelChars} onChange={set("label")} placeholder="e.g. Formatter" className={`${field} min-h-11 sm:min-h-9`} />
        </div>
      </div>
      <label htmlFor="new-skill-purpose" className={label}>
        What it does
      </label>
      <Textarea id="new-skill-purpose" value={form.purpose} maxLength={JOB_LIMITS.skillPurposeChars} onChange={set("purpose")} placeholder="One sentence: the part it does, and when to call it alone." className={`${field} min-h-20`} />
      <label htmlFor="new-skill-step" className={label}>
        Step in the workflow <span className="font-normal text-muted-foreground">(optional)</span>
      </label>
      <Input id="new-skill-step" value={form.step} maxLength={JOB_LIMITS.skillStepChars} onChange={set("step")} placeholder="e.g. Apply the template's formatting" className={`${field} min-h-11 sm:min-h-9`} />
      {error && (
        <p id="new-skill-error" aria-live="polite" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" size="lg" onClick={() => (setOpen(false), setError(null))}>
          Cancel
        </Button>
        <Button type="submit" size="lg" disabled={!ready || saving}>
          {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Add
        </Button>
      </div>
    </form>
  );
}
