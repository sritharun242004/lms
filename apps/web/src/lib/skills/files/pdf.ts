import type { PdfFacts } from "./types";

/** PDFs are read as Latin-1 text: only the header and uncompressed dictionary keys are looked at. */
const latin1 = (bytes: Uint8Array) => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("latin1");

/** A PDF with an /Encrypt dictionary needs a password (or restricts reading); Claude can't read it. */
export function isEncryptedPdf(bytes: Uint8Array): boolean {
  return /\/Encrypt\b/.test(latin1(bytes));
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
