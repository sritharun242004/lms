import { readJsonWithin } from "@/lib/api/body";
import { errorResponse } from "@/lib/api/response";
import { AiNotConfiguredError } from "@/lib/ai/config";
import { isAiCallError } from "@/lib/ai/errors";
import { LimitReachedError } from "@/lib/ai/usage";
import { aiErrorResponse } from "@/lib/prompt-bot/http";
import { FileReadError } from "../files/types";
import { JOB_LIMITS } from "../limits";
import { DuplicateSkillNameError } from "../zip";
import * as E from "./errors";
import { tooShortMessage } from "./task-text";

export const unauthorized = (): Response => errorResponse("Authentication required", "UNAUTHORIZED", 401);
/** Internal names stay "job"; what the person reads says "Task" (spec 2026-11-25 tasks, Naming). */
export const notFound = (what: "Task" | "File" | "Skill" | "Version" | "Question"): Response =>
  errorResponse(`${what} not found`, "NOT_FOUND", 404);

const conflict = (code: string, message: string) => errorResponse(message, code, 409);

/** The one mapper for every skill-jobs route: domain errors, FileReadError, zip errors and AI-layer errors. Null = not ours, rethrow. */
export function jobErrorResponse(error: unknown): Response | null {
  if (error instanceof E.JobNotFoundError) return notFound("Task");
  if (error instanceof E.FileNotFoundError) return notFound("File");
  if (error instanceof E.SkillNotFoundError) return notFound("Skill");
  if (error instanceof E.VersionNotFoundError) return notFound("Version");
  if (error instanceof E.QuestionNotFoundError) return notFound("Question");
  if (error instanceof E.TooManyQuestionsError) {
    return conflict(
      "TOO_MANY_QUESTIONS",
      error.kind === "FIXED"
        ? `A task can have at most ${JOB_LIMITS.questionsPerTask} questions to answer now. Remove one to add another.`
        : `A task can have at most ${JOB_LIMITS.perUseInputsPerTask} inputs Claude asks for each time. Remove one to add another.`,
    );
  }
  if (error instanceof E.DescriptionTooShortError) return errorResponse(`${tooShortMessage(error.length)}.`, "DESCRIPTION_TOO_SHORT", 400);
  if (error instanceof E.PerUseLabelTooLongError) {
    return errorResponse(`An input's name can be up to ${JOB_LIMITS.perUseLabelChars} characters.`, "VALIDATION_ERROR", 400);
  }
  if (error instanceof E.EnhanceInputTooShortError) {
    return errorResponse(`Write at least ${JOB_LIMITS.enhanceMinWords} words about the task first.`, "VALIDATION_ERROR", 400);
  }
  if (error instanceof E.AlreadyAnalysingError) return conflict("ALREADY_ANALYSING", "This file is still being analysed. Wait for it to finish.");
  if (error instanceof E.AlreadyGeneratingError) return conflict("ALREADY_GENERATING", "A skill in this task is being written. Wait for it to finish.");
  if (error instanceof E.FilesAnalysingError) return conflict("FILES_ANALYSING", "Wait until your files have been analysed.");
  if (error instanceof E.TooManyFilesError) {
    return conflict("TOO_MANY_FILES", `A task can have at most ${JOB_LIMITS.filesPerJob} files. Remove one to add another.`);
  }
  if (error instanceof E.FileNameTakenError) {
    return conflict("FILE_NAME_TAKEN", `Another file named "${error.fileName}" was added at the same moment. Upload it again.`);
  }
  if (error instanceof E.TooManySkillsError) {
    return conflict("TOO_MANY_SKILLS", `A task can have at most ${JOB_LIMITS.skillsPerJob} skills. Remove one to add another.`);
  }
  if (error instanceof E.DuplicateNameError) {
    return conflict("DUPLICATE_NAME", `A skill named "${error.skillName}" is already in this task. Choose another name.`);
  }
  if (error instanceof E.EmptyDescriptionError) return errorResponse("Describe the task first.", "VALIDATION_ERROR", 400);
  if (error instanceof E.NothingToDownloadError) return conflict("NOTHING_TO_DOWNLOAD", "Generate at least one skill before downloading.");
  if (error instanceof E.AssetMissingError) {
    return conflict("ASSET_MISSING", "A file this version uses is no longer available. Generate the skill again.");
  }
  if (error instanceof E.PackTooLargeError) {
    return conflict("PACK_TOO_LARGE", `This pack is over ${JOB_LIMITS.packZipBytes / (1024 * 1024)} MB. Download each skill on its own.`);
  }
  if (error instanceof DuplicateSkillNameError) {
    return conflict("DUPLICATE_NAME", `Two skills are named "${error.skillName}". Rename one and generate it again.`);
  }
  if (error instanceof FileReadError) return errorResponse(error.message, error.code, error.status);
  if (error instanceof LimitReachedError || error instanceof AiNotConfiguredError || isAiCallError(error)) return aiErrorResponse(error);
  return null;
}

/** Reads a small JSON body within JOB_LIMITS.jsonBodyBytes; over the cap is answered 413 before anything is parsed. */
export async function readJobJson(req: Request): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  const body = await readJsonWithin(req, JOB_LIMITS.jsonBodyBytes);
  if (body.ok) return body;
  const mb = `${JOB_LIMITS.jsonBodyBytes / 1024} KB`;
  return { ok: false, response: errorResponse(`That is over the ${mb} limit for one save. Make it shorter.`, "PAYLOAD_TOO_LARGE", 413) };
}
