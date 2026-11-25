import { KIND_EXTENSION, type SkillFileKind } from "./types";

const BASE_MAX = 80;

/**
 * The file's name under assets/: lower-case ASCII letters, digits and single hyphens, then the extension of the
 * sniffed kind (never the uploaded one, so "deck.PPTX.exe" sniffed as PPTX is "deck-pptx.pptx"). The upload's
 * last extension (1-5 letters or digits) is dropped first; any other dots become hyphens, so a name never starts
 * with a dot and has exactly one. Unique case-insensitively against `taken` with -2, -3, … At most 100 characters.
 */
export function assetFileName(original: string, kind: SkillFileKind, taken: Iterable<string>): string {
  const leaf = original.split(/[\\/]/).pop() ?? "";
  const base =
    leaf
      .replace(/\.[A-Za-z0-9]{1,5}$/, "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, BASE_MAX)
      .replace(/-+$/g, "") || "file";
  const extension = KIND_EXTENSION[kind];
  const used = new Set([...taken].map((name) => name.toLowerCase()));
  let candidate = `${base}.${extension}`;
  for (let n = 2; used.has(candidate); n += 1) candidate = `${base}-${n}.${extension}`;
  return candidate;
}
