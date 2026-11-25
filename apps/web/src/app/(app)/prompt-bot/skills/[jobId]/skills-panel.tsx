"use client";
import type { JobSkillView, JobView } from "@/lib/skills/jobs/types";

/** Replaced in Task 21. */
export function SkillsPanel(props: {
  job: JobView;
  gaps: number;
  aiConfigured: boolean;
  flushSaves(): Promise<void>;
  onJobChange(job: JobView): void;
  onSkillChange(skill: JobSkillView): void;
  onSkillRemoved(skillId: string): void;
}) {
  return <p className="text-sm text-muted-foreground">{props.job.skills.length} skills</p>;
}
