import { call, type CallResult, type SaveOptions, type ScoreReply } from "@/lib/prompt-bot/client";
import type {
  JobFileDetail,
  JobFileView,
  JobSkillView,
  JobView,
  PluginVersionDetail,
  PluginView,
  QuestionInput,
  TaskQuestionView,
  VersionDetail,
} from "./types";

const BASE = "/api/v1/prompt-bot/skill-jobs";

export const jobUrl = (jobId: string) => `${BASE}/${jobId}`;
const fileUrl = (jobId: string, fileId: string) => `${jobUrl(jobId)}/files/${fileId}`;
const skillUrl = (jobId: string, skillId: string) => `${jobUrl(jobId)}/skills/${skillId}`;
const questionUrl = (jobId: string, questionId: string) => `${jobUrl(jobId)}/questions/${encodeURIComponent(questionId)}`;

const send = (method: string, body?: unknown, options: SaveOptions = {}): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  ...(options.keepalive ? { keepalive: true } : {}),
});

export const createJob = (input: { title?: string; description?: string }): Promise<CallResult<JobView>> =>
  call<JobView>(BASE, send("POST", input));
export const getJob = (jobId: string): Promise<CallResult<JobView>> => call<JobView>(jobUrl(jobId));
export type JobPatch = { title?: string; description?: string; company?: string; pluginName?: string | null; pluginDisplayName?: string | null };
/** `pluginName` / `pluginDisplayName`: null resets to the default. */
export const patchJob = (jobId: string, patch: JobPatch, options: SaveOptions = {}): Promise<CallResult<JobView>> =>
  call<JobView>(jobUrl(jobId), send("PATCH", patch, options));
export const deleteJob = (jobId: string): Promise<CallResult<{ deleted: true }>> => call<{ deleted: true }>(jobUrl(jobId), send("DELETE"));

export const saveJobAnswer = (
  jobId: string,
  questionId: string,
  patch: { answer?: string; notRelevant?: boolean },
  options: SaveOptions = {},
): Promise<CallResult<{ saved: true }>> => call<{ saved: true }>(`${jobUrl(jobId)}/answers/${questionId}`, send("PUT", patch, options));
export const scoreJob = (jobId: string, revision: number): Promise<CallResult<ScoreReply>> =>
  call<ScoreReply>(`${jobUrl(jobId)}/score`, send("POST", { revision }));

/** Sends the text in the box (saved or not); nothing is stored. */
export const enhanceTask = (jobId: string, description: string): Promise<CallResult<{ brief: string }>> =>
  call<{ brief: string }>(`${jobUrl(jobId)}/enhance`, send("POST", { description }));
/** Writes (or rewrites) the task's questions; the reply is the whole task. */
export const generateQuestions = (jobId: string): Promise<CallResult<JobView>> => call<JobView>(`${jobUrl(jobId)}/questions/generate`, send("POST"));
export const addQuestion = (jobId: string, input: QuestionInput): Promise<CallResult<TaskQuestionView>> =>
  call<TaskQuestionView>(`${jobUrl(jobId)}/questions`, send("POST", input));
export const patchQuestion = (jobId: string, questionId: string, patch: Partial<QuestionInput>): Promise<CallResult<TaskQuestionView>> =>
  call<TaskQuestionView>(questionUrl(jobId, questionId), send("PATCH", patch));
export const deleteQuestion = (jobId: string, questionId: string): Promise<CallResult<{ deleted: true }>> =>
  call<{ deleted: true }>(questionUrl(jobId, questionId), send("DELETE"));

/**
 * The no-S3 path: the file itself is the body (the route reads it with a byte cap); its name, and the question it
 * answers when there is one, travel in the query.
 */
export const postJobFile = (jobId: string, file: File, questionId?: string | null): Promise<CallResult<JobFileView>> =>
  call<JobFileView>(`${jobUrl(jobId)}/files?name=${encodeURIComponent(file.name)}${questionId ? `&questionId=${encodeURIComponent(questionId)}` : ""}`, {
    method: "POST",
    body: file,
    headers: { "content-type": file.type || "application/octet-stream" },
  });

type UploadTarget = { mode: "s3"; fileId: string; uploadUrl: string; headers: Record<string, string>; maxBytes: number } | { mode: "direct"; maxBytes: number };
export type UploadOptions = { questionId?: string | null; onProgress?(fraction: number): void; signal?: AbortSignal };

/** Failures a person can fix by trying again (the connection dropped, or S3 refused a stale link). */
export const RETRYABLE_UPLOAD_CODES: ReadonlySet<string> = new Set(["NETWORK_ERROR", "UPLOAD_FAILED"]);
const CANCELLED = { ok: false as const, code: "UPLOAD_CANCELLED", message: "Upload cancelled." };
const INTERRUPTED = { ok: false as const, code: "NETWORK_ERROR", message: "The upload was interrupted. Check your connection and try again." };

/** One PUT straight to S3 with upload progress; resolves the HTTP status, or "network" / "aborted". */
function putToS3(target: Extract<UploadTarget, { mode: "s3" }>, file: File, options: UploadOptions): Promise<number | "network" | "aborted"> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", target.uploadUrl);
    for (const [name, value] of Object.entries(target.headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) options.onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => resolve(xhr.status);
    xhr.onerror = () => resolve("network");
    xhr.onabort = () => resolve("aborted");
    if (options.signal?.aborted) return resolve("aborted");
    options.signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

/**
 * Declares the file; with S3 configured, sends it straight to the bucket (progress via onProgress, cancel via
 * signal), then asks the server to check and store it. Without S3, posts it to this server as before.
 */
export async function uploadJobFile(jobId: string, file: File, options: UploadOptions = {}): Promise<CallResult<JobFileView>> {
  const declared = await call<UploadTarget>(`${jobUrl(jobId)}/files/upload-url`, send("POST", { name: file.name, size: file.size, questionId: options.questionId ?? undefined }));
  if (!declared.ok) return declared;
  if (options.signal?.aborted) return CANCELLED;
  if (declared.data.mode === "direct") return postJobFile(jobId, file, options.questionId);
  const status = await putToS3(declared.data, file, options);
  if (status === "aborted") return CANCELLED;
  if (status === "network") return INTERRUPTED;
  if (status < 200 || status >= 300) return { ok: false, code: "UPLOAD_FAILED", message: "The file storage refused the upload. Try again." };
  options.onProgress?.(1);
  return call<JobFileView>(`${fileUrl(jobId, declared.data.fileId)}/complete`, send("POST"));
}
export const getJobFile = (jobId: string, fileId: string): Promise<CallResult<JobFileDetail>> => call<JobFileDetail>(fileUrl(jobId, fileId));
export const saveAnalysis = (jobId: string, fileId: string, analysis: string): Promise<CallResult<JobFileView>> =>
  call<JobFileView>(fileUrl(jobId, fileId), send("PATCH", { analysis }));
export const analyseAgain = (jobId: string, fileId: string): Promise<CallResult<JobFileView>> =>
  call<JobFileView>(`${fileUrl(jobId, fileId)}/analyse`, send("POST"));
export const removeJobFile = (jobId: string, fileId: string): Promise<CallResult<{ deleted: true }>> =>
  call<{ deleted: true }>(fileUrl(jobId, fileId), send("DELETE"));

export const suggestSkills = (jobId: string): Promise<CallResult<JobView>> => call<JobView>(`${jobUrl(jobId)}/suggest`, send("POST"));
export type JobSkillInput = { name: string; label?: string; purpose: string; focus?: string; step?: string; fileIds?: string[] };
/** Always a sub-skill, appended last in the workflow. */
export const addJobSkill = (jobId: string, input: JobSkillInput): Promise<CallResult<JobSkillView>> =>
  call<JobSkillView>(`${jobUrl(jobId)}/skills`, send("POST", input));
export const patchJobSkill = (
  jobId: string,
  skillId: string,
  patch: { name?: string; label?: string; purpose?: string; focus?: string; step?: string; fileIds?: string[]; order?: number },
  options: SaveOptions = {},
): Promise<CallResult<JobSkillView>> => call<JobSkillView>(skillUrl(jobId, skillId), send("PATCH", patch, options));
export const removeJobSkill = (jobId: string, skillId: string): Promise<CallResult<{ deleted: true }>> =>
  call<{ deleted: true }>(skillUrl(jobId, skillId), send("DELETE"));
export const generateJobSkill = (jobId: string, skillId: string): Promise<CallResult<JobSkillView>> =>
  call<JobSkillView>(`${skillUrl(jobId, skillId)}/generate`, send("POST"));

export const getVersion = (jobId: string, skillId: string, version: number | "latest"): Promise<CallResult<VersionDetail>> =>
  call<VersionDetail>(`${skillUrl(jobId, skillId)}/versions/${version}`);
export const versionDownloadUrl = (jobId: string, skillId: string, version: number, format: "upload" | "pack") =>
  `${skillUrl(jobId, skillId)}/versions/${version}/download?format=${format}`;
export const jobDownloadUrl = (jobId: string) => `${jobUrl(jobId)}/download`;

const pluginUrl = (jobId: string) => `${jobUrl(jobId)}/plugin`;
/** Starts one plugin generation; the reply is the plugin, GENERATING (poll GET /:id). */
export const generatePlugin = (jobId: string): Promise<CallResult<PluginView>> => call<PluginView>(`${pluginUrl(jobId)}/generate`, send("POST"));
export const getPluginVersion = (jobId: string, version: number | "latest"): Promise<CallResult<PluginVersionDetail>> =>
  call<PluginVersionDetail>(`${pluginUrl(jobId)}/versions/${version}`);
export const pluginDownloadUrl = (jobId: string, version: number, format: "plugin" | "share") =>
  `${pluginUrl(jobId)}/versions/${version}/download?format=${format}`;
