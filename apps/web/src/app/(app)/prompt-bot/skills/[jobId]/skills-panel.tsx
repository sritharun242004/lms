"use client";
import * as React from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, type ConfirmDialogHandle } from "@/components/ui/confirm-dialog";
import { suggestSkills } from "@/lib/skills/jobs/client";
import type { JobSkillView, JobView, PluginView } from "@/lib/skills/jobs/types";
import { JOB_LIMITS } from "@/lib/skills/limits";
import { AddSubSkill } from "./add-sub-skill-form";
import { PluginCard } from "./plugin-card";
import { PluginGenerate } from "./plugin-generate";
import { PluginOverview, splitSkills } from "./plugin-overview";
import { PluginVersionPreview } from "./plugin-version-preview";
import { unansweredPhrase, type QueueSave } from "./skill-card";

export const REDRAFT_NOTE = "This replaces your plugin's skills and names. Past versions stay downloadable.";

type Props = {
  job: JobView;
  gaps: number;
  aiConfigured: boolean;
  flushSaves(): Promise<void>;
  /** The workspace's save queue: a skill's text autosaves through it, so leaving the page, Suggest or Generate sends it. */
  queueSave: QueueSave;
  onJobChange(job: JobView): void;
  onPluginChange(plugin: PluginView): void;
  onSkillChange(skill: JobSkillView): void;
  onSkillRemoved(skillId: string): void;
};

type SuggestQuestion = { title: string; description?: string; confirmLabel: string };

/** The one question Create / Redraft asks, or null to suggest at once (a first draft with every question answered). */
function suggestQuestion(gaps: number, hasSkills: boolean): SuggestQuestion | null {
  if (gaps > 0) {
    return {
      title: `${unansweredPhrase(gaps)} — your skills will be more general. Create them anyway?`,
      ...(hasSkills ? { description: REDRAFT_NOTE } : {}),
      confirmLabel: "Create anyway",
    };
  }
  if (hasSkills) return { title: "Redraft your plugin?", description: REDRAFT_NOTE, confirmLabel: "Redraft" };
  return null;
}

/** Step 3: the plugin — its names, the main skill and its sub-skills — then one Generate for the whole plugin. */
export function SkillsPanel({ job, gaps, aiConfigured, flushSaves, queueSave, onJobChange, onPluginChange, onSkillChange, onSkillRemoved }: Props) {
  const [suggesting, setSuggesting] = React.useState(false);
  const confirmRef = React.useRef<ConfirmDialogHandle>(null);
  // Each card's file-chip saves, so Suggest and Generate read the files the user chose, not the ones before a click.
  const fileSaves = React.useRef(new Map<string, () => Promise<void>>());
  const registerFileSaves = React.useCallback((skillId: string, pending: () => Promise<void>) => {
    fileSaves.current.set(skillId, pending);
    return () => {
      if (fileSaves.current.get(skillId) === pending) fileSaves.current.delete(skillId);
    };
  }, []);
  const hasSkills = job.skills.length > 0;
  const { subs } = splitSkills(job.skills);
  const locked = job.plugin.status === "GENERATING";

  async function settleSaves() {
    await flushSaves();
    await Promise.all([...fileSaves.current.values()].map((pending) => pending()));
  }

  async function suggest() {
    const question = suggestQuestion(gaps, hasSkills);
    if (question && !(await confirmRef.current?.open(question))) return;
    setSuggesting(true);
    await settleSaves();
    const result = await suggestSkills(job.id);
    setSuggesting(false);
    if (!result.ok) return void toast.error(result.message);
    onJobChange(result.data);
  }

  const suggestButton = (
    <Button size="lg" variant={hasSkills ? "outline" : "default"} disabled={!aiConfigured || suggesting || locked} onClick={() => void suggest()}>
      {suggesting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
      {suggesting ? "Drafting your plugin…" : hasSkills ? "Redraft my skills" : "Create my skills"}
    </Button>
  );

  if (!hasSkills) {
    return (
      <section aria-labelledby="skills-heading" className="glass flex flex-col items-center gap-3 rounded-[1.75rem] px-5 py-8 text-center sm:py-10">
        <h2 id="skills-heading" className="text-lg font-semibold text-balance">
          Your plugin
        </h2>
        <p className="max-w-md text-sm text-pretty text-muted-foreground">Claude will suggest one plugin: a main skill for the whole job and a few sub-skills for its parts.</p>
        <p className="max-w-md text-xs text-pretty text-muted-foreground">Drafted from your task, files and answers — nothing is copied from public or existing skills. You can rename, add or remove skills before you generate.</p>
        {suggestButton}
        {gaps > 0 && (
          <p className="max-w-md rounded-lg bg-warning/10 px-3 py-1.5 text-xs text-foreground">
            {unansweredPhrase(gaps)}. Answer them in Questions first for sharper skills.
          </p>
        )}
        <ConfirmDialog ref={confirmRef} />
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="skills-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1 basis-72">
          <h2 id="skills-heading" className="text-lg font-semibold text-balance">
            Your plugin
          </h2>
          <p className="text-sm text-pretty text-muted-foreground">A main skill that runs the whole job, and sub-skills you can also call on their own.</p>
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          {suggestButton}
          <span className="text-xs text-muted-foreground">Replaces the skills and names. Past versions stay downloadable.</span>
        </div>
      </div>
      <PluginCard jobId={job.id} plugin={job.plugin} onChange={onPluginChange} />
      <PluginOverview job={job} queueSave={queueSave} onSkillChange={onSkillChange} onSkillRemoved={onSkillRemoved} registerFileSaves={registerFileSaves} />
      <AddSubSkill jobId={job.id} full={subs.length >= JOB_LIMITS.subSkillsMax} locked={locked} onAdded={onSkillChange} />
      <PluginGenerate job={job} gaps={gaps} aiConfigured={aiConfigured} settleSaves={settleSaves} onPluginChange={onPluginChange} />
      {job.plugin.versions.length > 0 && <PluginVersionPreview jobId={job.id} plugin={job.plugin} />}
      <ConfirmDialog ref={confirmRef} />
    </section>
  );
}
