import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { generateJobSkillDraft } from "@/lib/ai/claude";
import { consumeAiUsage } from "@/lib/ai/usage";
import { JOB_LIMITS } from "../limits";
import { oneLine } from "../names";
import { assembleJobSkill, planAssets, validateJobSkill } from "./assemble";
import { AlreadyGeneratingError, EmptyDescriptionError, FilesAnalysingError, SkillNotFoundError } from "./errors";
import { purgeUnreferencedFiles } from "./files";
import { buildJobGenerateMessage, buildJobRetryMessage } from "./instructions";
import { activeFiles, jobPerUseInputs, jobQuestionContext } from "./jobs";
import { loadSkillView } from "./skills";
import { generationCutoff, isAnalysing, isGenerating } from "./staleness";
import type { JobSkillView } from "./types";

export const JOB_GENERATION_FAILED_MESSAGE = "The AI couldn't finish writing this skill. Try again.";

function findOwnedSkill(jobId: string, skillId: string, userId: string) {
  return prisma.skillJobSkill.findFirst({
    where: { id: skillId, jobId, job: { userId } },
    select: {
      id: true,
      name: true,
      purpose: true,
      status: true,
      generationStartedAt: true,
      validationErrors: true,
      fileIds: true,
      latestVersion: true,
      job: { select: { title: true, description: true, outputType: true } },
    },
  });
}

/** Only the error's name is logged: messages from the AI layer can echo prompt text. */
const logName = (error: unknown) => (error instanceof Error ? error.name : "unknown");

/** Ownership, the spec's 409/400 checks, an atomic claim, then one skill_generate unit. runJobSkillGeneration does the writing. */
export async function startJobSkillGeneration(jobId: string, skillId: string, userId: string, now = new Date()): Promise<JobSkillView> {
  const skill = await findOwnedSkill(jobId, skillId, userId);
  if (!skill) throw new SkillNotFoundError();
  if (isGenerating(skill.status, skill.generationStartedAt, now)) throw new AlreadyGeneratingError();
  const files = await prisma.skillJobFile.findMany({
    where: { jobId, id: { in: skill.fileIds }, deletedAt: null },
    select: { analysisStatus: true, analysisStartedAt: true },
  });
  if (files.some((f) => isAnalysing(f.analysisStatus, f.analysisStartedAt, now))) throw new FilesAnalysingError();
  if (!skill.job.description.trim()) throw new EmptyDescriptionError();

  // Claim first so a double press or a lost race never spends a unit; generationStartedAt is the staleness clock.
  const claimed = await prisma.skillJobSkill.updateMany({
    where: {
      id: skillId,
      jobId,
      OR: [{ status: { not: "GENERATING" } }, { generationStartedAt: null }, { generationStartedAt: { lt: generationCutoff(now) } }],
    },
    data: { status: "GENERATING", validationErrors: [], generationStartedAt: now },
  });
  if (claimed.count === 0) throw new AlreadyGeneratingError();
  try {
    await consumeAiUsage(userId, "skill_generate");
  } catch (error) {
    // Nothing will run: hand the skill back as it was, if the claim is still ours.
    await prisma.skillJobSkill.updateMany({
      where: { id: skillId, status: "GENERATING", generationStartedAt: now },
      data: { status: skill.status, generationStartedAt: skill.generationStartedAt, validationErrors: skill.validationErrors },
    });
    throw error;
  }
  const view = await loadSkillView(jobId, skillId, userId);
  if (!view) throw new SkillNotFoundError();
  return view;
}

/**
 * One model call, assembly, validation, one retry with the errors, then a new immutable version or FAILED.
 * Runs in after(); never throws. A failure never touches older versions, which stay downloadable.
 * Every final write is guarded by this run's claim (generationStartedAt), so a run that outlived the stale
 * window never overwrites a newer run with its version or its FAILED.
 */
export async function runJobSkillGeneration(jobId: string, skillId: string, userId: string): Promise<void> {
  let claim: Date | null | undefined;
  const ours = () => ({ id: skillId, status: "GENERATING" as const, generationStartedAt: claim ?? null });
  try {
    const skill = await findOwnedSkill(jobId, skillId, userId);
    if (!skill) return;
    claim = skill.generationStartedAt;
    const byId = new Map((await activeFiles(jobId)).map((f) => [f.id, f]));
    const used = skill.fileIds.flatMap((id) => {
      const f = byId.get(id);
      return f ? [f] : [];
    });
    const plan = planAssets(
      used.map((f) => ({
        id: f.id,
        fileName: f.fileName,
        assetName: f.assetName,
        kind: f.kind,
        size: f.size,
        // Only a finished analysis is used; an interrupted or failed one is reported as missing.
        analysis: f.analysisStatus === "READY" ? f.analysis : null,
        questionId: f.questionId,
      })),
    );
    const [questions, perUse] = await Promise.all([jobQuestionContext(jobId), jobPerUseInputs(jobId)]);
    const message = buildJobGenerateMessage({
      title: skill.job.title,
      description: skill.job.description,
      outputType: skill.job.outputType,
      questions,
      perUse,
      skill: { name: skill.name, purpose: skill.purpose },
      files: plan,
    });
    const context = { questions: questions.map((q) => ({ id: q.id, text: q.text })), perUse };

    let draft = await generateJobSkillDraft(message);
    let built = assembleJobSkill(skill.name, draft, plan, context);
    let errors = validateJobSkill(skill.name, built.files, built.assets);
    if (errors.length > 0) {
      draft = await generateJobSkillDraft(buildJobRetryMessage(message, draft, errors));
      built = assembleJobSkill(skill.name, draft, plan, context);
      errors = validateJobSkill(skill.name, built.files, built.assets);
    }
    if (errors.length > 0) {
      await prisma.skillJobSkill.updateMany({ where: ours(), data: { status: "FAILED", validationErrors: errors } });
      return;
    }

    const version = skill.latestVersion + 1;
    const written = await prisma.$transaction(async (tx) => {
      // The claim check comes first: a lost claim makes no write at all.
      const claimed = await tx.skillJobSkill.updateMany({
        where: ours(),
        data: { status: "READY", latestVersion: version, validationErrors: [] },
      });
      if (claimed.count === 0) return false;
      await tx.skillVersion.create({
        data: {
          skillId,
          version,
          name: skill.name,
          description: oneLine(draft.description),
          files: built.files.map((f) => ({ path: f.path, content: f.content })) as Prisma.InputJsonValue,
          assets: built.assets.map((a) => ({ fileId: a.fileId, path: a.path, fileName: a.fileName, bytes: a.bytes })) as Prisma.InputJsonValue,
          assetFileIds: built.assets.map((a) => a.fileId),
        },
      });
      await tx.skillVersion.deleteMany({ where: { skillId, version: { lte: version - JOB_LIMITS.versionsKept } } });
      return true;
    });
    if (!written) {
      console.error("[skills-builder] job skill generation lost its claim; the draft was discarded");
      return;
    }
    // The version is written; a purge failure only leaves removed files' bytes for the next purge.
    await purgeUnreferencedFiles(jobId).catch((error: unknown) => {
      console.error("[skills-builder] could not purge unreferenced files:", logName(error));
    });
  } catch (error) {
    console.error("[skills-builder] job skill generation failed:", logName(error));
    // Without a known claim (the skill never loaded) there is nothing of ours to mark.
    if (claim === undefined) return;
    await prisma.skillJobSkill
      .updateMany({ where: ours(), data: { status: "FAILED", validationErrors: [JOB_GENERATION_FAILED_MESSAGE] } })
      .catch((writeError: unknown) => {
        // The skill stays GENERATING and becomes retryable once the 10-minute stale window passes.
        console.error("[skills-builder] could not record the failure:", logName(writeError));
      });
  }
}
