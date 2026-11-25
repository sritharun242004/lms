/** Plugins spec, Generation Flow: one claim and one plugin_generate unit, then every skill written in parallel in after(). */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { generateJobSkillDraft } from "@/lib/ai/claude";
import { consumeAiUsage } from "@/lib/ai/usage";
import { JOB_LIMITS } from "../limits";
import { oneLine } from "../names";
import { effectivePlugin } from "../plugin-names";
import type { SkillFile } from "../types";
import { assembleJobSkill, validateJobSkill, type PlanInputFile, type PluginSkillSections, type QuestionRef } from "./assemble";
import { purgeUnreferencedFiles } from "./files";
import { buildJobGenerateMessage, buildJobRetryMessage, buildSubSkillGenerateMessage, type ShippedFile } from "./instructions";
import { buildCommands, buildPluginManifest, manifestFile, pluginVersionRecord, validatePlugin } from "./plugin";
import { pluginSkillSections } from "./plugin-assemble";
import { planPluginAssets } from "./plugin-assets";
import { EmptyDescriptionError, FilesAnalysingError, JobNotFoundError, PluginGeneratingError, PluginInvalidError } from "./errors";
import { activeFiles, jobPerUseInputs, jobQuestionContext, loadJobView, mainFirst, notGeneratingPlugin } from "./jobs";
import { isAnalysing, isGenerating } from "./staleness";
import type { JobSkillDraft, PerUseInput, PluginView, SkillRole, VersionAsset } from "./types";

export const PLUGIN_GENERATION_FAILED_MESSAGE = "The AI couldn't finish writing this skill. Try again.";

/** Why this structure can't be generated, in the words the UI shows; empty = it can. */
export function pluginStructureErrors(skills: { role: string }[]): string[] {
  const mains = skills.filter((s) => s.role === "MAIN").length;
  const subs = skills.length - mains;
  const errors: string[] = [];
  if (mains !== 1) errors.push(mains === 0 ? "Add a main skill first: use Create my skills." : "A plugin can have only one main skill.");
  if (subs < JOB_LIMITS.subSkillsMin) errors.push(`Add at least ${JOB_LIMITS.subSkillsMin} sub-skills.`);
  if (subs > JOB_LIMITS.subSkillsMax) errors.push(`A plugin can have at most ${JOB_LIMITS.subSkillsMax} sub-skills.`);
  return errors;
}

/** Ownership, description, files, structure, an atomic claim, then one plugin_generate unit (handed back on failure). */
export async function startPluginGeneration(jobId: string, userId: string, now = new Date()): Promise<PluginView> {
  const job = await prisma.skillJob.findFirst({
    where: { id: jobId, userId },
    select: {
      description: true,
      pluginStatus: true,
      pluginGenerationStartedAt: true,
      pluginValidationErrors: true,
      skills: { select: { role: true, fileIds: true } },
    },
  });
  if (!job) throw new JobNotFoundError();
  if (!job.description.trim()) throw new EmptyDescriptionError();
  const used = [...new Set(job.skills.flatMap((s) => s.fileIds))];
  const files = await prisma.skillJobFile.findMany({
    where: { jobId, id: { in: used }, deletedAt: null },
    select: { analysisStatus: true, analysisStartedAt: true },
  });
  if (files.some((f) => isAnalysing(f.analysisStatus, f.analysisStartedAt, now))) throw new FilesAnalysingError();
  const invalid = pluginStructureErrors(job.skills);
  if (invalid.length > 0) throw new PluginInvalidError(invalid);
  if (isGenerating(job.pluginStatus, job.pluginGenerationStartedAt, now)) throw new PluginGeneratingError();

  // Claim first so a double press or a lost race never spends a unit; pluginGenerationStartedAt is the staleness clock.
  const claimed = await prisma.skillJob.updateMany({
    where: { id: jobId, userId, OR: notGeneratingPlugin(now) },
    data: { pluginStatus: "GENERATING", pluginValidationErrors: [], pluginGenerationStartedAt: now },
  });
  if (claimed.count === 0) throw new PluginGeneratingError();
  try {
    await consumeAiUsage(userId, "plugin_generate", now);
  } catch (error) {
    // Nothing will run: hand the plugin back as it was, if the claim is still ours.
    await prisma.skillJob.updateMany({
      where: { id: jobId, pluginStatus: "GENERATING", pluginGenerationStartedAt: now },
      data: { pluginStatus: job.pluginStatus, pluginGenerationStartedAt: job.pluginGenerationStartedAt, pluginValidationErrors: job.pluginValidationErrors },
    });
    throw error;
  }
  const view = await loadJobView(jobId, userId, now);
  if (!view) throw new JobNotFoundError();
  return view.plugin;
}

/** Only the error's name is logged: messages from the AI layer can echo prompt text. */
const logName = (error: unknown) => (error instanceof Error ? error.name : "unknown");

type RunSkill = { name: string; role: SkillRole; label: string; purpose: string; focus: string; step: string; fileIds: string[] };
type WrittenSkill = { skill: RunSkill; description: string; files: SkillFile[]; assets: VersionAsset[] };
type SkillOutcome = { ok: true; written: WrittenSkill } | { ok: false; errors: string[] };
type Shared = { questions: QuestionRef[]; perUse: PerUseInput[] };

/** One skill: one call, assembly, validation, one retry with the errors. Errors come back prefixed with the skill's name. */
async function writeSkill(skill: RunSkill, message: string, plan: ShippedFile[], sections: PluginSkillSections, shared: Shared): Promise<SkillOutcome> {
  const role = skill.role === "MAIN" ? "main" : "sub";
  const context = { questions: shared.questions, perUse: shared.perUse, plugin: sections };
  try {
    let draft: JobSkillDraft = await generateJobSkillDraft(message, role);
    let built = assembleJobSkill(skill.name, draft, plan, context);
    let errors = validateJobSkill(skill.name, built.files, built.assets);
    if (errors.length > 0) {
      draft = await generateJobSkillDraft(buildJobRetryMessage(message, draft, errors), role);
      built = assembleJobSkill(skill.name, draft, plan, context);
      errors = validateJobSkill(skill.name, built.files, built.assets);
    }
    if (errors.length > 0) return { ok: false, errors: errors.map((e) => `${skill.name}: ${e}`) };
    return { ok: true, written: { skill, description: oneLine(draft.description), ...built } };
  } catch (error) {
    console.error("[skills-builder] plugin skill generation failed:", logName(error));
    return { ok: false, errors: [`${skill.name}: ${PLUGIN_GENERATION_FAILED_MESSAGE}`] };
  }
}

const toPlanFile = (f: Awaited<ReturnType<typeof activeFiles>>[number]): PlanInputFile => ({
  id: f.id,
  fileName: f.fileName,
  assetName: f.assetName,
  kind: f.kind,
  size: f.size,
  // Only a finished analysis is used; an interrupted or failed one is reported as missing.
  analysis: f.analysisStatus === "READY" ? f.analysis : null,
  questionId: f.questionId,
});

/**
 * Writes every skill in parallel, then the plugin files, validates the whole plugin and stores one immutable version.
 * Runs in after(); never throws. Any skill failing marks the plugin FAILED with every prefixed error and writes nothing.
 * Every final write is guarded by this run's claim (pluginGenerationStartedAt), so a run that outlived the stale window
 * never overwrites a newer run.
 */
export async function runPluginGeneration(jobId: string, userId: string): Promise<void> {
  let claim: Date | null | undefined;
  const ours = () => ({ id: jobId, pluginStatus: "GENERATING" as const, pluginGenerationStartedAt: claim ?? null });
  try {
    const job = await prisma.skillJob.findFirst({
      where: { id: jobId, userId },
      select: {
        title: true,
        description: true,
        outputType: true,
        company: true,
        pluginName: true,
        pluginDisplayName: true,
        pluginGenerationStartedAt: true,
        pluginLatestVersion: true,
        user: { select: { name: true } },
        skills: { select: { name: true, role: true, label: true, purpose: true, focus: true, step: true, fileIds: true, order: true } },
      },
    });
    if (!job) return;
    claim = job.pluginGenerationStartedAt;
    const plugin = effectivePlugin(job);
    const skills = mainFirst(job.skills);
    const main = skills[0];
    const subs = skills.slice(1);
    const [files, questionRows, perUse] = await Promise.all([activeFiles(jobId), jobQuestionContext(jobId), jobPerUseInputs(jobId)]);
    const plans = planPluginAssets(skills, files.map(toPlanFile));
    const sections = pluginSkillSections(plugin, skills, perUse.length > 0);
    const shared: Shared = { questions: questionRows.map((q) => ({ id: q.id, text: q.text })), perUse };
    const task = { title: job.title, company: job.company, description: job.description, outputType: job.outputType, questions: questionRows, perUse, plugin };
    const named = (s: RunSkill) => ({ name: s.name, purpose: s.purpose });

    const outcomes = await Promise.all(
      skills.map((skill) => {
        const plan = plans.get(skill.name) ?? [];
        const message =
          skill.role === "MAIN"
            ? buildJobGenerateMessage({ ...task, skill: named(skill), files: plan, subSkills: subs.map(named) })
            : buildSubSkillGenerateMessage({
                ...task,
                main: named(main),
                subSkill: { ...named(skill), focus: skill.focus },
                siblings: subs.filter((s) => s !== skill).map(named),
                files: plan,
              });
        return writeSkill(skill, message, plan, sections.get(skill.name)!, shared);
      }),
    );
    const failed = outcomes.flatMap((o) => (o.ok ? [] : o.errors));
    const written = outcomes.flatMap((o) => (o.ok ? [o.written] : []));
    const version = job.pluginLatestVersion + 1;
    let errors = failed;
    const manifest = buildPluginManifest({
      ...plugin,
      version,
      mainPurpose: main.purpose,
      subNames: subs.map((s) => s.name),
      company: job.company,
      userName: job.user.name,
    });
    const pluginFiles = [manifestFile(manifest), ...buildCommands(skills)];
    if (errors.length === 0) errors = validatePlugin({ manifest, files: pluginFiles, skills: written.map((w) => ({ ...w.skill, files: w.files, assets: w.assets })) });
    if (errors.length > 0) {
      await prisma.skillJob.updateMany({ where: ours(), data: { pluginStatus: "FAILED", pluginValidationErrors: errors } });
      return;
    }

    const record = pluginVersionRecord(
      written.map((w) => ({ ...w.skill, description: w.description, files: w.files, assets: w.assets })),
      pluginFiles,
    );
    const stored = await prisma.$transaction(async (tx) => {
      // The claim check comes first: a lost claim makes no write at all.
      const claimed = await tx.skillJob.updateMany({ where: ours(), data: { pluginStatus: "READY", pluginLatestVersion: version, pluginValidationErrors: [] } });
      if (claimed.count === 0) return false;
      await tx.skillPluginVersion.create({
        data: {
          jobId,
          version,
          name: plugin.name,
          displayName: manifest.displayName,
          skills: record.skills as Prisma.InputJsonValue,
          files: record.files as Prisma.InputJsonValue,
          assets: record.assets as Prisma.InputJsonValue,
          assetFileIds: record.assetFileIds,
        },
      });
      await tx.skillPluginVersion.deleteMany({ where: { jobId, version: { lte: version - JOB_LIMITS.pluginVersionsKept } } });
      return true;
    });
    if (!stored) {
      console.error("[skills-builder] plugin generation lost its claim; the drafts were discarded");
      return;
    }
    // The version is written; a purge failure only leaves removed files' bytes for the next purge.
    await purgeUnreferencedFiles(jobId).catch((error: unknown) => console.error("[skills-builder] could not purge unreferenced files:", logName(error)));
  } catch (error) {
    console.error("[skills-builder] plugin generation failed:", logName(error));
    // Without a known claim (the job never loaded) there is nothing of ours to mark.
    if (claim === undefined) return;
    await prisma.skillJob
      .updateMany({ where: ours(), data: { pluginStatus: "FAILED", pluginValidationErrors: [PLUGIN_GENERATION_FAILED_MESSAGE] } })
      .catch((writeError: unknown) => console.error("[skills-builder] could not record the failure:", logName(writeError)));
  }
}
