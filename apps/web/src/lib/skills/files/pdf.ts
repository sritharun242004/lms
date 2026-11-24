import type { PdfFacts } from "./types";

/** PDFs are read as Latin-1 text: only the header and uncompressed dictionary keys are looked at. */
const latin1 = (bytes: Uint8Array) => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("latin1");

const TAIL_BYTES = 4096;
const XREF_DICT_BYTES = 2048;

/**
 * A PDF with an /Encrypt entry in its trailer dictionary needs a password (or restricts reading); Claude can't read it.
 * Only the trailer area is read: the last 4 KB (classic trailer) and the xref-stream dictionary at the startxref
 * offset (PDF 1.5+). The literal "/Encrypt" in page content or metadata is not a trailer entry.
 */
export function isEncryptedPdf(bytes: Uint8Array): boolean {
  const tail = latin1(bytes.subarray(Math.max(0, bytes.length - TAIL_BYTES)));
  if (/\/Encrypt\b/.test(tail)) return true;
  const offset = Number(/startxref\s+(\d+)/.exec(tail)?.[1]);
  if (!Number.isSafeInteger(offset) || offset >= bytes.length) return false;
  const dict = latin1(bytes.subarray(offset, offset + XREF_DICT_BYTES));
  return /^\s*\d+\s+\d+\s+obj\s*<<[\s\S]*?\/Encrypt\b/.test(dict.split(/\bstream\b/)[0]);
}

const unescapeLiteral = (value: string) => value.replace(/\\([\\()])/g, "$1").replace(/\\[nrtbf]/g, " ");

/**
 * Header facts only (spec, stage 2, PDF): Claude reads the document itself. Page objects inside compressed
 * object streams are invisible here, so a count of 0 is reported as unknown (null), never as "no pages".
 */
export function extractPdf(bytes: Uint8Array): PdfFacts {
  const text = latin1(bytes);
  const pages = text.match(/\/Type\s*\/Page(?![A-Za-z])/g)?.length ?? 0;
  const title = /\/Title\s*\(((?:\\.|[^\\)])*)\)/.exec(text)?.[1];
  return {
    kind: "PDF",
    version: /^%PDF-(\d\.\d)/.exec(text)?.[1] ?? null,
    pages: pages > 0 ? pages : null,
    title: title ? unescapeLiteral(title).replace(/\s+/g, " ").trim().slice(0, 200) || null : null,
  };
}
