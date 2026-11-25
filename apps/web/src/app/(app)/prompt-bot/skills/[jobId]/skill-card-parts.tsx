"use client";
import { ArrowDown, ArrowUp, ChevronRight, Trash2, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { JobSkillView } from "@/lib/skills/jobs/types";
import { JOB_LIMITS } from "@/lib/skills/limits";

export const MAIN_BADGE = "Main — runs everything, using all sub-skills";
export const SUB_BADGE = "Use alone for just this part";
export type TextField = "label" | "purpose" | "step" | "focus";
type Text = Record<TextField, string>;

const FIELD = "bg-white/60 dark:bg-white/5";
const LABEL = "block text-xs font-medium text-muted-foreground";

type HeaderProps = {
  skill: JobSkillView;
  position: number | null;
  locked: boolean;
  onMoveUp?: (() => void) | null;
  onMoveDown?: (() => void) | null;
};

/** The role line: the main skill's badge, or a sub-skill's step number, badge and move buttons. */
export function SkillCardHeader({ skill, position, locked, onMoveUp, onMoveDown }: HeaderProps) {
  if (skill.role === "MAIN") {
    return (
      <p className="flex items-center gap-2 text-sm font-medium text-primary">
        <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Workflow className="size-4" />
        </span>
        {MAIN_BADGE}
      </p>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold tabular-nums text-primary">
        {position}
      </span>
      <span className="min-w-0 flex-1 text-sm font-medium text-muted-foreground">{SUB_BADGE}</span>
      <Button type="button" variant="ghost" size="icon" aria-label={`Move ${skill.name} up`} disabled={locked || !onMoveUp} onClick={() => onMoveUp?.()} className="size-11 text-muted-foreground sm:size-8">
        <ArrowUp className="size-4" aria-hidden />
      </Button>
      <Button type="button" variant="ghost" size="icon" aria-label={`Move ${skill.name} down`} disabled={locked || !onMoveDown} onClick={() => onMoveDown?.()} className="size-11 text-muted-foreground sm:size-8">
        <ArrowDown className="size-4" aria-hidden />
      </Button>
    </div>
  );
}

type FieldsProps = {
  skill: JobSkillView;
  name: string;
  nameError: string | null;
  text: Text;
  locked: boolean;
  onName(value: string): void;
  onNameSave(): void;
  onText(field: TextField, value: string): void;
};

/** Name, label, what it does and, for a sub-skill, its workflow step and what it leaves to the main skill. */
export function SkillCardFields({ skill, name, nameError, text, locked, onName, onNameSave, onText }: FieldsProps) {
  const id = (part: string) => `skill-${part}-${skill.id}`;
  const sr = <span className="sr-only">: {skill.name}</span>;
  return (
    <>
      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)]">
        <div className="min-w-0">
          <label htmlFor={id("name")} className={LABEL}>
            Skill name{sr}
          </label>
          <Input
            id={id("name")}
            value={name}
            maxLength={JOB_LIMITS.skillNameChars}
            disabled={locked}
            spellCheck={false}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? id("name-error") : undefined}
            onChange={(e) => onName(e.target.value)}
            onBlur={onNameSave}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className={`mt-1 min-h-11 font-mono text-base font-semibold sm:min-h-9 ${FIELD}`}
          />
          {nameError && (
            <p id={id("name-error")} aria-live="polite" className="mt-1.5 text-xs text-destructive">
              {nameError}
            </p>
          )}
        </div>
        <div className="min-w-0">
          <label htmlFor={id("label")} className={LABEL}>
            Label{sr}
          </label>
          <Input id={id("label")} value={text.label} maxLength={JOB_LIMITS.skillLabelChars} disabled={locked} placeholder="e.g. Grammar check" onChange={(e) => onText("label", e.target.value)} className={`mt-1 min-h-11 sm:min-h-9 ${FIELD}`} />
        </div>
      </div>
      <label htmlFor={id("purpose")} className={`mt-3 ${LABEL}`}>
        What it does{sr}
      </label>
      <Textarea id={id("purpose")} value={text.purpose} maxLength={JOB_LIMITS.skillPurposeChars} disabled={locked} onChange={(e) => onText("purpose", e.target.value)} className={`mt-1 min-h-16 ${FIELD}`} />
      {skill.role === "SUB" && (
        <>
          <label htmlFor={id("step")} className={`mt-3 ${LABEL}`}>
            Step in the workflow{sr}
          </label>
          <Input id={id("step")} value={text.step} maxLength={JOB_LIMITS.skillStepChars} disabled={locked} placeholder="e.g. Check the wording before handing over" onChange={(e) => onText("step", e.target.value)} className={`mt-1 min-h-11 sm:min-h-9 ${FIELD}`} />
          <details className="group mt-2">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 sm:min-h-8 [&::-webkit-details-marker]:hidden">
              <ChevronRight className="size-3.5 transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden />
              What it leaves to the main skill
            </summary>
            <label htmlFor={id("focus")} className="sr-only">
              What it leaves to the main skill{sr}
            </label>
            <Textarea id={id("focus")} value={text.focus} maxLength={JOB_LIMITS.skillFocusChars} disabled={locked} placeholder="What this part does, and what it leaves to the main skill." onChange={(e) => onText("focus", e.target.value)} className={`mt-1 min-h-20 ${FIELD}`} />
          </details>
        </>
      )}
    </>
  );
}

type FooterProps = { skill: JobSkillView; locked: boolean; removeBlocked: string | null; onRemove(): void };

/** A sub-skill's Remove, disabled with its reason at the minimum. */
export function SkillCardFooter({ skill, locked, removeBlocked, onRemove }: FooterProps) {
  const noteId = `skill-remove-note-${skill.id}`;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 min-h-11 text-muted-foreground hover:text-destructive sm:min-h-8"
        disabled={locked || removeBlocked !== null}
        aria-describedby={removeBlocked ? noteId : undefined}
        onClick={onRemove}
      >
        <Trash2 className="size-4" aria-hidden />
        Remove<span className="sr-only">: {skill.name}</span>
      </Button>
      {removeBlocked && (
        <span id={noteId} className="text-xs text-muted-foreground">
          {removeBlocked}
        </span>
      )}
    </div>
  );
}
