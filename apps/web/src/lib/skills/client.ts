import { call, type ScoreReply } from "@/lib/prompt-bot/client";
import type { SkillFile, SkillItemView, SkillPackView } from "./types";

export const skillPackUrl = (packId: string) => `/api/v1/prompt-bot/skill-packs/${packId}`;
const itemUrl = (packId: string, itemId: string) => `${skillPackUrl(packId)}/items/${itemId}`;
const send = (method: string, body?: unknown): RequestInit => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

export const createPack = (description: string, role: string) =>
  call<SkillPackView>("/api/v1/prompt-bot/skill-packs", send("POST", { description, ...(role.trim() ? { role: role.trim() } : {}) }));
export const getPack = (packId: string) => call<SkillPackView>(skillPackUrl(packId));
export const patchPack = (packId: string, patch: { title: string }) => call<SkillPackView>(skillPackUrl(packId), send("PATCH", patch));
export const addItem = (packId: string, input: { name: string; purpose: string }) =>
  call<SkillItemView>(`${skillPackUrl(packId)}/items`, send("POST", input));
export const getItem = (packId: string, itemId: string) => call<SkillItemView>(itemUrl(packId, itemId));
export const patchItem = (packId: string, itemId: string, patch: { name?: string; purpose?: string; order?: number }) =>
  call<SkillItemView>(itemUrl(packId, itemId), send("PATCH", patch));
export const deleteItem = (packId: string, itemId: string) => call<{ deleted: true }>(itemUrl(packId, itemId), send("DELETE"));
export const saveItemAnswer = (packId: string, itemId: string, questionId: string, patch: { answer?: string; notRelevant?: boolean }) =>
  call<{ saved: true }>(`${itemUrl(packId, itemId)}/answers/${questionId}`, send("PUT", patch));
export const scoreItem = (packId: string, itemId: string, revision: number) =>
  call<ScoreReply>(`${itemUrl(packId, itemId)}/score`, send("POST", { revision }));
export const requestGenerate = (packId: string, itemId: string) => call<SkillItemView>(`${itemUrl(packId, itemId)}/generate`, send("POST"));
export const saveItemFiles = (packId: string, itemId: string, files: SkillFile[]) =>
  call<SkillItemView>(`${itemUrl(packId, itemId)}/files`, send("PATCH", { files }));

/** Fetches a zip and saves it under the server's filename, so refusals (409, 404) can be shown as messages. */
export async function downloadZip(url: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      return { ok: false, message: body?.error?.message ?? "The download failed. Please try again." };
    }
    const blob = await res.blob();
    const filename = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "skills.zip";
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
    return { ok: true };
  } catch {
    return { ok: false, message: "Couldn't reach the server. Check your connection." };
  }
}
