import { createHash } from "node:crypto";
import { JOB_LIMITS } from "../limits";
import { extractDocx } from "./docx";
import { extractImage } from "./image";
import { extractPdf } from "./pdf";
import { extractPptx } from "./pptx";
import { sniffFile } from "./sniff";
import { FILE_READ_MESSAGES, FileReadError, KIND_MIME, type FileFacts, type SkillFileKind } from "./types";
import { extractXlsx } from "./xlsx";

export type ReadUpload = { kind: SkillFileKind; mimeType: string; facts: FileFacts; sha256: string };

const jsonBytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), "utf8");

/** Arrays trimmed from the end, in this order, until the facts fit. */
const TRIMMABLE: Record<FileFacts["kind"], string[]> = {
  PPTX: ["slides", "colorsUsed", "fontsUsed", "layouts", "masters", "themes"],
  DOCX: ["headings", "styles"],
  XLSX: ["sheets", "definedNames", "numberFormats"],
  PDF: [],
  PNG: [],
  JPEG: [],
};

/** Keeps stored facts within maxBytes of JSON (spec, Limits): trims arrays, then the DOCX text sample, and sets truncated. */
export function boundFacts(facts: FileFacts, maxBytes: number = JOB_LIMITS.factsBytes): FileFacts {
  if (jsonBytes(facts) <= maxBytes) return facts;
  const copy = structuredClone(facts) as FileFacts & Record<string, unknown>;
  if ("truncated" in copy) copy.truncated = true;
  for (const key of TRIMMABLE[copy.kind]) {
    const list = copy[key] as unknown[];
    while (list.length > 0 && jsonBytes(copy) > maxBytes) list.pop();
    if (jsonBytes(copy) <= maxBytes) return copy;
  }
  if (copy.kind === "DOCX") {
    while (copy.textSample.length > 0 && jsonBytes(copy) > maxBytes) copy.textSample = copy.textSample.slice(0, Math.floor(copy.textSample.length / 2));
  }
  return copy;
}

/** Stage 1 and 2 of the pipeline: sniff, extract, bound. Any extractor failure is the user-facing "unreadable". */
export async function readUpload(bytes: Uint8Array): Promise<ReadUpload> {
  const sniffed = sniffFile(bytes);
  let facts: FileFacts;
  try {
    switch (sniffed.kind) {
      case "PPTX":
        facts = extractPptx(sniffed.pkg);
        break;
      case "DOCX":
        facts = extractDocx(sniffed.pkg);
        break;
      case "XLSX":
        facts = extractXlsx(sniffed.pkg);
        break;
      case "PDF":
        facts = extractPdf(bytes);
        break;
      default:
        facts = await extractImage(bytes, sniffed.kind);
    }
  } catch (error) {
    if (error instanceof FileReadError) throw error;
    throw new FileReadError("FILE_UNREADABLE", FILE_READ_MESSAGES.unreadable);
  }
  return {
    kind: sniffed.kind,
    mimeType: KIND_MIME[sniffed.kind],
    facts: boundFacts(facts),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
