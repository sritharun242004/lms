/** Plugins spec, Orchestration: the server-owned SKILL.md sections (pure strings; assemble.ts places them). */
import { oneLine } from "../names";

export const HOW_THIS_SKILL_WORKS_HEADING = "## How this skill works";
const HOW_INTRO =
  "This skill runs the whole job and uses every sub-skill in this plugin. At each step, load and follow that sub-skill's SKILL.md (in Claude Code or Cowork you can also run its command), then carry on here.";
const GATHER_STEP = 'Gather the inputs listed in "Before you start".';
const FINISH_STEP = "Finish with the steps below and hand the result over.";
/** A sub-skill's "Before you start" intro: it lists every per-use input, and asks only for what this part needs. */
export const SUB_BEFORE_YOU_START_NOTE = "Ask only for the ones this part needs, and only if the request doesn't already give them.";

export type WorkflowSub = { name: string; step: string; purpose: string };

/** How Claude Code and Cowork call a plugin skill. */
export const pluginCommand = (plugin: string, skill: string) => `/${plugin}:${skill}`;

const sentence = (text: string) => {
  const line = oneLine(text);
  return /[.!?…]$/.test(line) ? line : `${line}.`;
};

/** Each sub-skill's step number in the main workflow (the gather step is 1 when there are per-use inputs). */
export function workflowSteps(subs: readonly { name: string }[], gather: boolean): Map<string, number> {
  return new Map(subs.map((s, i) => [s.name, i + (gather ? 2 : 1)]));
}

/** The main skill's workflow: every sub-skill in order, each with its command. */
export function howThisSkillWorksSection(plugin: { name: string }, subs: readonly WorkflowSub[], gather: boolean): string {
  const steps = [
    ...(gather ? [GATHER_STEP] : []),
    ...subs.map((s) => `\`${s.name}\` — ${sentence(s.step || s.purpose)} (\`${pluginCommand(plugin.name, s.name)}\`)`),
    FINISH_STEP,
  ];
  return [HOW_THIS_SKILL_WORKS_HEADING, "", HOW_INTRO, "", ...steps.map((step, i) => `${i + 1}. ${step}`)].join("\n");
}

/** The note under a sub-skill's title: it stands alone, and the main skill also runs it as one step. */
export function standAloneNote(displayName: string, mainName: string, step: number): string {
  const name = oneLine(displayName).replace(/\*/g, "");
  return `> Part of the **${name}** plugin. Use this skill alone when you only need this part; the \`${mainName}\` skill also runs it as step ${step} of the whole job.`;
}
