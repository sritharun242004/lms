import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { AiNotConfiguredError } from "@/lib/ai/config";
import { AiResponseError } from "@/lib/ai/errors";
import { LimitReachedError } from "@/lib/ai/usage";
import { FileReadError, FILE_READ_MESSAGES } from "../files/types";
import { DuplicateSkillNameError } from "../zip";
import * as E from "./errors";
import { jobErrorResponse, notFound, unauthorized } from "./http";

async function body(res: Response | null) {
  expect(res).not.toBeNull();
  return { status: res!.status, ...(await res!.json()).error };
}

describe("jobErrorResponse", () => {
  it.each([
    [new E.JobNotFoundError(), 404, "NOT_FOUND", "Job not found"],
    [new E.FileNotFoundError(), 404, "NOT_FOUND", "File not found"],
    [new E.SkillNotFoundError(), 404, "NOT_FOUND", "Skill not found"],
    [new E.VersionNotFoundError(), 404, "NOT_FOUND", "Version not found"],
    [new E.AlreadyAnalysingError(), 409, "ALREADY_ANALYSING", "This file is still being analysed. Wait for it to finish."],
    [new E.AlreadyGeneratingError(), 409, "ALREADY_GENERATING", "A skill in this job is being written. Wait for it to finish."],
    [new E.FilesAnalysingError(), 409, "FILES_ANALYSING", "Wait until your files have been analysed."],
    [new E.TooManyFilesError(), 409, "TOO_MANY_FILES", "A job can have at most 10 files. Remove one to add another."],
    [new E.FileNameTakenError("Q3 deck.pptx"), 409, "FILE_NAME_TAKEN", 'Another file named "Q3 deck.pptx" was added at the same moment. Upload it again.'],
    [new E.TooManySkillsError(), 409, "TOO_MANY_SKILLS", "A job can have at most 5 skills. Remove one to add another."],
    [new E.DuplicateNameError("board-deck"), 409, "DUPLICATE_NAME", 'A skill named "board-deck" is already in this job. Choose another name.'],
    [new E.EmptyDescriptionError(), 400, "VALIDATION_ERROR", "Describe the job first."],
    [new E.NothingToDownloadError(), 409, "NOTHING_TO_DOWNLOAD", "Generate at least one skill before downloading."],
    [new E.AssetMissingError(), 409, "ASSET_MISSING", "A file this version uses is no longer available. Generate the skill again."],
    [new E.PackTooLargeError(), 409, "PACK_TOO_LARGE", "This pack is over 100 MB. Download each skill on its own."],
    [new DuplicateSkillNameError("board-deck"), 409, "DUPLICATE_NAME", 'Two skills are named "board-deck". Rename one and generate it again.'],
  ])("maps %o", async (error, status, code, message) => {
    expect(await body(jobErrorResponse(error))).toEqual({ status, code, message });
  });

  it("uses a FileReadError's own code, status and message", async () => {
    expect(await body(jobErrorResponse(new FileReadError("UNSUPPORTED_FILE", FILE_READ_MESSAGES.macro)))).toEqual({
      status: 415,
      code: "UNSUPPORTED_FILE",
      message: FILE_READ_MESSAGES.macro,
    });
    expect((await body(jobErrorResponse(new FileReadError("FILE_ENCRYPTED", FILE_READ_MESSAGES.ole)))).status).toBe(422);
  });

  it("maps AI-layer errors with the enhancer's mapper", async () => {
    expect((await body(jobErrorResponse(new AiNotConfiguredError()))).code).toBe("AI_NOT_CONFIGURED");
    expect((await body(jobErrorResponse(new LimitReachedError("skill_analyze", new Date("2026-11-26T00:00:00Z"))))).status).toBe(429);
    expect((await body(jobErrorResponse(new AiResponseError("bad")))).code).toBe("AI_FAILED");
    expect((await body(jobErrorResponse(new Anthropic.APIConnectionError({ message: "down" })))).status).toBe(502);
  });

  it("returns null for anything that is not ours, so routes rethrow it", () => {
    expect(jobErrorResponse(new Error("database is down"))).toBeNull();
    expect(jobErrorResponse("x")).toBeNull();
  });

  it("builds the 401 and 404 responses", async () => {
    expect(await body(unauthorized())).toEqual({ status: 401, code: "UNAUTHORIZED", message: "Authentication required" });
    expect(await body(notFound("Question"))).toEqual({ status: 404, code: "NOT_FOUND", message: "Question not found" });
  });
});
