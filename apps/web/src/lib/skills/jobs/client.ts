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
export const patchJob = (jobId: string, patch: { title?: string; description?: string; company?: string; pluginName?: string | null; pluginDisplayName?: string | null },
  options: SaveOptions = {}): Promise<CallResult<JobView>> =>
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
 * The file itself is the body (the route reads it with a byte cap); its name, and the question it
 * answers when there is one, travel in the query.
 */
export const uploadJobFile = (jobId: string, file: File, questionId?: string): Promise<CallResult<JobFileView>> =>
  call<JobFileView>(`${jobUrl(jobId)}/files?name=${encodeURIComponent(file.name)}${questionId ? `&questionId=${encodeURIComponent(questionId)}` : ""}`, {
    method: "POST",
    body: file,
    headers: { "content-type": file.type || "application/octet-stream" },
  });
export const getJobFile = (jobId: string, fileId: string): Promise<CallResult<JobFileDetail>> => call<JobFileDetail>(fileUrl(jobId, fileId));
export const saveAnalysis = (jobId: string, fileId: string, analysis: string): Promise<CallResult<JobFileView>> =>
  call<JobFileView>(fileUrl(jobId, fileId), send("PATCH", { analysis }));
export const analyseAgain = (jobId: string, fileId: string): Promise<CallResult<JobFileView>> =>
  call<JobFileView>(`${fileUrl(jobId, fileId)}/analyse`, send("POST"));
export const removeJobFile = (jobId: string, fileId: string): Promise<CallResult<{ deleted: true }>> =>
  call<{ deleted: true }>(fileUrl(jobId, fileId), send("DELETE"));

export const suggestSkills = (jobId: string): Promise<CallResult<JobView>> => call<JobView>(`${jobUrl(jobId)}/suggest`, send("POST"));
export const addJobSkill = (jobId: string, input: { name: string; label?: string; purpose: string; focus?: string; step?: string; fileIds?: string[] }): Promise<CallResult<JobSkillView>> =>
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

/** Plugins: one Generate writes a new immutable version of the whole plugin (202, polled via getJob). */
export const generatePlugin = (jobId: string): Promise<CallResult<PluginView>> => call<PluginView>(`${jobUrl(jobId)}/plugin/generate`, send("POST"));
export const getPluginVersion = (jobId: string, version: number | "latest"): Promise<CallResult<PluginVersionDetail>> =>
  call<PluginVersionDetail>(`${jobUrl(jobId)}/plugin/versions/${version}`);
export const pluginDownloadUrl = (jobId: string, version: number, format: "plugin" | "share") =>
  `${jobUrl(jobId)}/plugin/versions/${version}/download?format=${format}`;
