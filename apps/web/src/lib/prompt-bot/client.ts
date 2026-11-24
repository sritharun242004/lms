import type { AnswerView, SessionView } from "./sessions";

export type CallResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; details?: Record<string, string[]> };

export type ScoreReply = { applied: boolean; revision: number; answers: AnswerView[] };

/** Options for a save that may be sent while the page is going away. */
export type SaveOptions = { keepalive?: boolean };

/** Browsers cap in-flight keepalive bodies at 64 KiB per page; larger saves go as ordinary requests. */
const KEEPALIVE_BODY_LIMIT = 60_000;

export async function call<T>(url: string, init?: RequestInit): Promise<CallResult<T>> {
  const keepalive =
    init?.keepalive === true && typeof init.body === "string" && new TextEncoder().encode(init.body).length <= KEEPALIVE_BODY_LIMIT;
  try {
    const res = await fetch(url, { credentials: "include", headers: { "content-type": "application/json" }, ...init, keepalive });
    const body = await res.json().catch(() => null);
    if (res.ok && body?.success) return { ok: true, data: body.data as T };
    return {
      ok: false,
      code: body?.error?.code ?? "REQUEST_FAILED",
      message: body?.error?.message ?? "Something went wrong.",
      ...(body?.error?.details ? { details: body.error.details as Record<string, string[]> } : {}),
    };
  } catch {
    return { ok: false, code: "NETWORK_ERROR", message: "Couldn't reach the server. Check your connection." };
  }
}

export const createSession = (basePrompt: string) =>
  call<SessionView>("/api/v1/prompt-bot/sessions", { method: "POST", body: JSON.stringify({ basePrompt }) });
export const getSession = (id: string) => call<SessionView>(`/api/v1/prompt-bot/sessions/${id}`);
export const patchSession = (id: string, patch: { title?: string; basePrompt?: string }, options: SaveOptions = {}) =>
  call<SessionView>(`/api/v1/prompt-bot/sessions/${id}`, { method: "PATCH", body: JSON.stringify(patch), keepalive: options.keepalive });
export const saveAnswer = (id: string, questionId: string, patch: { answer?: string; notRelevant?: boolean }, options: SaveOptions = {}) =>
  call<{ saved: true }>(`/api/v1/prompt-bot/sessions/${id}/answers/${questionId}`, {
    method: "PUT",
    body: JSON.stringify(patch),
    keepalive: options.keepalive,
  });
export const scoreSession = (id: string, revision: number) =>
  call<ScoreReply>(`/api/v1/prompt-bot/sessions/${id}/score`, { method: "POST", body: JSON.stringify({ revision }) });

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | null = null;
  return (...args: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export async function readEnhanceStream(
  res: Response,
  onDelta: (text: string) => void,
): Promise<{ version: number } | { error: string }> {
  if (!res.ok || !res.body || !res.headers.get("content-type")?.includes("text/event-stream")) {
    const body = await res.json().catch(() => null);
    return { error: body?.error?.message ?? "Enhance failed. Please try again." };
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;
    let end: number;
    while ((end = buffer.indexOf("\n\n")) !== -1) {
      const line = buffer.slice(0, end).trim();
      buffer = buffer.slice(end + 2);
      if (!line.startsWith("data:")) continue;
      let event: { type: string; text?: string; version?: number; message?: string };
      try {
        event = JSON.parse(line.slice(5).trim());
      } catch {
        continue;
      }
      if (event.type === "delta" && event.text) onDelta(event.text);
      if (event.type === "done") return { version: event.version ?? 0 };
      if (event.type === "error") return { error: event.message ?? "Enhance failed." };
    }
  }
  return { error: "The connection closed before the prompt finished." };
}
