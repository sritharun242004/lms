import { MAX_ATTACHMENT_SIZE_BYTES, MAX_ATTACHMENT_SIZE_MB, type UserRole } from "@cms/shared";

export function isFocusedGroupPath(pathname: string): boolean {
  return /^\/chat\/[^/]+\/?$/.test(pathname);
}

export function chatBackHref(canManage: boolean, joinedGroupCount: number): string {
  if (canManage) return "/dashboard";
  return joinedGroupCount > 1 ? "/chat" : "/";
}

export function visibleRoleLabel(role: UserRole | string): string {
  return role === "ADMIN" ? "Super Admin" : "Participant";
}

export function isSupportedChatFile(file: { name: string; size: number }): { ok: true } | { ok: false; message: string } {
  if (file.size <= 0) return { ok: false, message: `${file.name} is empty and cannot be uploaded.` };
  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    return { ok: false, message: `${file.name} is too large. The maximum file size is ${MAX_ATTACHMENT_SIZE_MB} MB.` };
  }
  return { ok: true };
}

export function friendlyUploadError(message: string): string {
  if (/string pattern failed to match/i.test(message)) {
    return "The browser could not prepare this file. Rename it using simple letters and numbers, then try again.";
  }
  if (/failed to fetch|networkerror|network request failed/i.test(message)) {
    return "The upload was interrupted. Check your connection and try again.";
  }
  return message || "The file could not be uploaded. Please try again.";
}

export function applyMemberCount(
  current: number,
  event: { groupId: string; memberCount: number },
  activeGroupId: string
): number {
  return event.groupId === activeGroupId ? event.memberCount : current;
}

export function removeUploadByKey<T extends { key: string }>(rows: T[], key: string): T[] {
  return rows.filter((row) => row.key !== key);
}

export type QuizDraft = {
  name: string;
  question: string;
  options: string[];
  chartType?: "BAR" | "DONUT" | "PIE";
};

export function normalizeQuizDraft(input: QuizDraft) {
  const normalized = {
    name: input.name.trim(),
    question: input.question.trim(),
    options: input.options.map((option) => option.trim()).filter(Boolean),
    chartType: input.chartType ?? "BAR",
  };
  if (!normalized.name) throw new Error("Quiz name is required");
  if (!normalized.question) throw new Error("Question is required");
  if (normalized.options.length < 2 || normalized.options.length > 8) {
    throw new Error("Each quiz needs 2 to 8 choices");
  }
  return normalized;
}
