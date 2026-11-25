"use client";
import * as React from "react";
import { toast } from "sonner";
import { patchJobSkill } from "@/lib/skills/jobs/client";
import type { JobSkillView, JobView } from "@/lib/skills/jobs/types";
import { JOB_LIMITS } from "@/lib/skills/limits";
import { SkillCard, type QueueSave } from "./skill-card";

export const SUB_SKILLS_MIN_NOTE = `A plugin needs at least ${JOB_LIMITS.subSkillsMin} sub-skills.`;

type Props = {
  job: JobView;
  queueSave: QueueSave;
  onSkillChange(skill: JobSkillView): void;
  onSkillRemoved(skillId: string): void;
  registerFileSaves(skillId: string, pending: () => Promise<void>): () => void;
};

const byOrder = (a: JobSkillView, b: JobSkillView) => a.order - b.order;
/** The main skill (first when the view has more than one, as after a migration) and the sub-skills in workflow order. */
export function splitSkills(skills: JobSkillView[]): { main: JobSkillView | null; subs: JobSkillView[] } {
  const main = skills.filter((s) => s.role === "MAIN").sort(byOrder)[0] ?? null;
  return { main, subs: skills.filter((s) => s !== main).sort(byOrder) };
}

/** The plugin's hierarchy: the main skill on top, its sub-skills indented under it as numbered workflow steps. */
export function PluginOverview({ job, queueSave, onSkillChange, onSkillRemoved, registerFileSaves }: Props) {
  const { main, subs } = splitSkills(job.skills);
  const locked = job.plugin.status === "GENERATING";
  const removeBlocked = subs.length <= JOB_LIMITS.subSkillsMin ? SUB_SKILLS_MIN_NOTE : null;
  const [moving, setMoving] = React.useState(false);

  // Swaps a sub-skill with its neighbour: the moved one takes the neighbour's order, the neighbour its old one.
  async function move(skill: JobSkillView, neighbour: JobSkillView) {
    if (moving) return;
    setMoving(true);
    const result = await patchJobSkill(job.id, skill.id, { order: neighbour.order });
    setMoving(false);
    if (!result.ok) return void toast.error(result.message);
    onSkillChange(result.data);
    onSkillChange({ ...neighbour, order: skill.order });
  }

  const common = { jobId: job.id, pluginName: job.plugin.name, files: job.files, queueSave, onChange: onSkillChange, onRemoved: onSkillRemoved, registerFileSaves };
  return (
    <div className="flex flex-col gap-3">
      {main && <SkillCard key={main.id} {...common} skill={main} position={null} locked={locked} removeBlocked={null} />}
      <ol aria-label="Sub-skills, in workflow order" className="ml-3 flex flex-col gap-3 border-l border-border/70 pl-3 sm:ml-6 sm:pl-6">
        {subs.map((s, i) => (
          <li
            key={s.id}
            className="relative before:absolute before:-left-3 before:top-9 before:h-px before:w-3 before:bg-border/70 sm:before:-left-6 sm:before:w-6"
          >
            <SkillCard
              {...common}
              skill={s}
              position={i + 1}
              locked={locked}
              removeBlocked={removeBlocked}
              onMoveUp={i > 0 ? () => void move(s, subs[i - 1]) : null}
              onMoveDown={i < subs.length - 1 ? () => void move(s, subs[i + 1]) : null}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}
