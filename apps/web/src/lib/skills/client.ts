import { call } from "@/lib/prompt-bot/client";
import type { SkillItemDetail, SkillPackView } from "./types";

/** Legacy packs are read-only: view, read one skill's files, download. */
export const skillPackUrl = (packId: string) => `/api/v1/prompt-bot/skill-packs/${packId}`;
export const getPack = (packId: string) => call<SkillPackView>(skillPackUrl(packId));
export const getItem = (packId: string, itemId: string) => call<SkillItemDetail>(`${skillPackUrl(packId)}/items/${itemId}`);

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
