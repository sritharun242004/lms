"use client";
import * as React from "react";
import { AlertTriangle, Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, type ConfirmDialogHandle } from "@/components/ui/confirm-dialog";
import { generatePlugin } from "@/lib/skills/jobs/client";
import type { JobView, PluginView } from "@/lib/skills/jobs/types";
import { JOB_LIMITS } from "@/lib/skills/limits";
import { splitSkills } from "./plugin-overview";
import { unansweredPhrase } from "./skill-card";

export const NEEDS_SUB_SKILLS = `Add at least ${JOB_LIMITS.subSkillsMin} sub-skills to generate.`;

type ErrorGroup = { skill: string | null; errors: string[] };
/** Server errors are prefixed with the skill they belong to ("deck-designer: …"); anything else is the plugin's. */
export function groupErrorsBySkill(errors: string[], skills: string[]): ErrorGroup[] {
  const known = new Set(skills);
  const groups = new Map<string | null, string[]>();
  for (const error of errors) {
    const at = error.indexOf(": ");
    const skill = at > 0 && known.has(error.slice(0, at)) ? error.slice(0, at) : null;
    const message = skill ? error.slice(at + 2) : error;
    groups.set(skill, [...(groups.get(skill) ?? []), message]);
  }
  return [...groups].map(([skill, list]) => ({ skill, errors: list })).sort((a, b) => Number(a.skill === null) - Number(b.skill === null));
}

type Props = {
  job: JobView;
  gaps: number;
  aiConfigured: boolean;
  /** Sends every waiting text and file save, so the run reads what is on screen. */
  settleSaves(): Promise<void>;
  onPluginChange(plugin: PluginView): void;
};

/** One Generate for the whole plugin: a new immutable version, written in the background and polled by the page. */
export function PluginGenerate({ job, gaps, aiConfigured, settleSaves, onPluginChange }: Props) {
  const [busy, setBusy] = React.useState(false);
  const [invalid, setInvalid] = React.useState<string[] | null>(null);
  const confirmRef = React.useRef<ConfirmDialogHandle>(null);
  const { plugin } = job;
  const generating = plugin.status === "GENERATING";
  const tooFew = splitSkills(job.skills).subs.length < JOB_LIMITS.subSkillsMin;
  const label = plugin.latestVersion === 0 ? "Generate plugin" : `Generate plugin v${plugin.latestVersion + 1}`;
  const failed = !generating && plugin.status === "FAILED";

  async function generate() {
    if (gaps > 0) {
      const confirmed = await confirmRef.current?.open({
        title: `${unansweredPhrase(gaps)} — the plugin will be more general. Generate anyway?`,
        confirmLabel: "Generate anyway",
      });
      if (!confirmed) return;
    }
    setBusy(true);
    setInvalid(null);
    await settleSaves();
    const result = await generatePlugin(job.id);
    setBusy(false);
    if (result.ok) return onPluginChange(result.data);
    const details = Object.values(result.details ?? {}).flat();
    if (result.code === "PLUGIN_INVALID") return setInvalid(details.length > 0 ? details : [result.message]);
    toast.error(result.message);
  }

  const problems = invalid ?? (failed ? plugin.validationErrors : null);
  return (
    <section aria-labelledby="generate-heading" className="glass rounded-[1.75rem] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1 basis-60">
          <h3 id="generate-heading" className="text-base font-semibold text-balance">
            Generate the whole plugin
          </h3>
          <p className="mt-0.5 text-sm text-pretty text-muted-foreground">
            {`Writes all ${job.skills.length} skills together as a new version. Earlier versions stay as they are.`}
          </p>
        </div>
        <Button size="lg" disabled={generating || busy || tooFew || !aiConfigured} aria-describedby={tooFew ? "generate-needs-subs" : undefined} onClick={() => void generate()}>
          {busy || generating ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Wand2 className="size-4" aria-hidden />}
          {label}
        </Button>
      </div>
      {tooFew && (
        <p id="generate-needs-subs" className="mt-2 text-xs text-muted-foreground">
          {NEEDS_SUB_SKILLS}
        </p>
      )}
      <div role="status">
        {generating && (
          <p className="mt-4 flex items-center gap-2 rounded-xl bg-primary/5 px-3 py-2 text-sm">
            <Loader2 className="size-4 shrink-0 animate-spin text-primary motion-reduce:animate-none" aria-hidden />
            {`Writing ${job.skills.length} skills… This can take a few minutes. You can leave this page.`}
          </p>
        )}
      </div>
      {problems && problems.length > 0 && (
        <div role="alert" className="mt-4 rounded-2xl bg-destructive/10 p-4 text-sm">
          <p className="flex items-center gap-2 font-medium text-destructive">
            <AlertTriangle className="size-4" aria-hidden />
            {invalid ? "Fix these before generating" : "Last attempt failed"}
          </p>
          <ul className="mt-2 space-y-2">
            {groupErrorsBySkill(problems, job.skills.map((s) => s.name)).map((group) => (
              <li key={group.skill ?? "plugin"}>
                {group.skill && <p className="font-mono text-xs font-semibold text-foreground">{group.skill}</p>}
                <ul className="mt-0.5 list-disc space-y-0.5 pl-5 break-words text-destructive">
                  {group.errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          {failed && plugin.latestVersion > 0 && <p className="mt-2 text-foreground">{`v${plugin.latestVersion} is still available.`}</p>}
        </div>
      )}
      <ConfirmDialog ref={confirmRef} />
    </section>
  );
}
