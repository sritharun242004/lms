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

export const unauthorized = (): Response => errorResponse("Authentication required", "UNAUTHORIZED", 401);
export const notFound = (what: "Job" | "File" | "Skill" | "Version" | "Question"): Response =>
  errorResponse(`${what} not found`, "NOT_FOUND", 404);

const conflict = (code: string, message: string) => errorResponse(message, code, 409);

/** The one mapper for every skill-jobs route: domain errors, FileReadError, zip errors and AI-layer errors. Null = not ours, rethrow. */
export function jobErrorResponse(error: unknown): Response | null {
  if (error instanceof E.JobNotFoundError) return notFound("Job");
  if (error instanceof E.FileNotFoundError) return notFound("File");
  if (error instanceof E.SkillNotFoundError) return notFound("Skill");
  if (error instanceof E.VersionNotFoundError) return notFound("Version");
  if (error instanceof E.AlreadyAnalysingError) return conflict("ALREADY_ANALYSING", "This file is still being analysed. Wait for it to finish.");
  if (error instanceof E.AlreadyGeneratingError) return conflict("ALREADY_GENERATING", "A skill in this job is being written. Wait for it to finish.");
  if (error instanceof E.FilesAnalysingError) return conflict("FILES_ANALYSING", "Wait until your files have been analysed.");
  if (error instanceof E.TooManyFilesError) {
    return conflict("TOO_MANY_FILES", `A job can have at most ${JOB_LIMITS.filesPerJob} files. Remove one to add another.`);
  }
  if (error instanceof E.TooManySkillsError) {
    return conflict("TOO_MANY_SKILLS", `A job can have at most ${JOB_LIMITS.skillsPerJob} skills. Remove one to add another.`);
  }
  if (error instanceof E.DuplicateNameError) {
    return conflict("DUPLICATE_NAME", `A skill named "${error.skillName}" is already in this job. Choose another name.`);
  }
  if (error instanceof E.EmptyDescriptionError) return errorResponse("Describe the job first.", "VALIDATION_ERROR", 400);
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
