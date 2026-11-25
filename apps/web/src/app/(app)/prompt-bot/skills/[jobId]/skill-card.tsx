"use client";
import * as React from "react";
import { toast } from "sonner";
import { ConfirmDialog, type ConfirmDialogHandle } from "@/components/ui/confirm-dialog";
import type { SaveOptions } from "@/lib/prompt-bot/client";
import { patchJobSkill, removeJobSkill } from "@/lib/skills/jobs/client";
import type { JobFileView, JobSkillView } from "@/lib/skills/jobs/types";
import { cn } from "@/lib/utils";
import { HowToCall } from "./how-to-call";
import { SkillCardFields, SkillCardFooter, SkillCardHeader, type TextField } from "./skill-card-parts";
import { SkillFileChips } from "./skill-file-chips";

const INLINE_NAME_ERRORS = new Set(["DUPLICATE_NAME", "ALREADY_GENERATING", "VALIDATION_ERROR"]);
export { FILE_SAVE_FAILED_MESSAGE } from "./skill-file-chips";

export const unansweredPhrase = (gaps: number) => `${gaps} question${gaps === 1 ? "" : "s"} unanswered`;

/** The workspace's save queue (useMatrixAnswers): debounced per key, sent on Suggest, Generate and when the page is left. */
export type QueueSave = (key: string, run: (options: SaveOptions) => Promise<void>) => void;

type Props = {
  jobId: string;
  skill: JobSkillView;
  /** The saved plugin id, for the "/<plugin>:<skill>" command. */
  pluginName: string;
  /** Sub-skills: their 1-based step in the main workflow; null for the main skill. */
  position: number | null;
  files: JobFileView[];
  /** The plugin is being written: nothing changes until it finishes. */
  locked: boolean;
  /** Why this sub-skill can't be removed (the minimum), or null. */
  removeBlocked: string | null;
  queueSave: QueueSave;
  onChange(skill: JobSkillView): void;
  onRemoved(skillId: string): void;
  onMoveUp?: (() => void) | null;
  onMoveDown?: (() => void) | null;
  /** Lets the page wait for this card's file-chip saves (Suggest and Generate read the skills' files). Returns the unregister. */
  registerFileSaves(skillId: string, pending: () => Promise<void>): () => void;
};

/** One skill of the plugin: the main skill on top, or a numbered sub-skill of its workflow. */
export function SkillCard(props: Props) {
  const { jobId, skill, pluginName, position, files, locked, removeBlocked, queueSave, onChange, onRemoved, registerFileSaves } = props;
  const isMain = skill.role === "MAIN";
  const [name, setName] = React.useState(skill.name);
  const [nameError, setNameError] = React.useState<string | null>(null);
  const [text, setText] = React.useState({ label: skill.label, purpose: skill.purpose, step: skill.step, focus: skill.focus });
  const [removing, setRemoving] = React.useState(false);
  const confirmRef = React.useRef<ConfirmDialogHandle>(null);

  function updateText(field: TextField, value: string) {
    setText((t) => ({ ...t, [field]: value }));
    // A blank purpose is never sent; queueing a no-op drops an earlier value still waiting.
    queueSave(`skill:${skill.id}:${field}`, async (options) => {
      if (field === "purpose" && !value.trim()) return;
      const result = await patchJobSkill(jobId, skill.id, { [field]: value }, options);
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

  async function remove() {
    const confirmed = await confirmRef.current?.open({
      title: `Remove ${skill.name}?`,
      description:
        skill.latestVersion > 0
          ? "Its earlier single-skill versions are deleted too. Past plugin versions stay downloadable."
          : "Past plugin versions stay downloadable.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!confirmed) return;
    setRemoving(true);
    const result = await removeJobSkill(jobId, skill.id);
    setRemoving(false);
    if (!result.ok) return void toast.error(result.message);
    onRemoved(skill.id);
  }

  const label = isMain ? `Main skill ${skill.name}` : `Sub-skill ${position}: ${skill.name}`;
  return (
    <article className={cn("glass rounded-[1.75rem] p-4 sm:p-5", isMain && "ring-1 ring-primary/25")} aria-label={label}>
      <SkillCardHeader skill={skill} position={position} locked={locked} onMoveUp={props.onMoveUp} onMoveDown={props.onMoveDown} />
      <SkillCardFields
        skill={skill}
        name={name}
        nameError={nameError}
        text={text}
        locked={locked}
        onName={(value) => {
          setName(value);
          setNameError(null);
        }}
        onNameSave={() => void saveName()}
        onText={updateText}
      />
      <SkillFileChips jobId={jobId} skill={skill} files={files} disabled={locked} onChange={onChange} registerFileSaves={registerFileSaves} />
      <HowToCall plugin={pluginName} skill={skill.name} role={skill.role} />
      {!isMain && <SkillCardFooter skill={skill} locked={locked || removing} removeBlocked={removeBlocked} onRemove={() => void remove()} />}
      <ConfirmDialog ref={confirmRef} />
    </article>
  );
}
