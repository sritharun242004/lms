import { openOoxml, type OoxmlPackage } from "./ooxml";
import { isEncryptedPdf } from "./pdf";
import { FILE_READ_MESSAGES, FileReadError } from "./types";

export type Sniffed = { kind: "PPTX" | "DOCX" | "XLSX"; pkg: OoxmlPackage } | { kind: "PDF" | "PNG" | "JPEG"; pkg: null };

const ZIP = [0x50, 0x4b, 0x03, 0x04];
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];

const startsWith = (bytes: Uint8Array, magic: number[]) => bytes.length >= magic.length && magic.every((b, i) => bytes[i] === b);
const unsupported = (message: string = FILE_READ_MESSAGES.unsupported) => new FileReadError("UNSUPPORTED_FILE", message);

/** The kind comes from the bytes, never from the browser's MIME type or the file extension (spec, stage 1). */
export function sniffFile(bytes: Uint8Array): Sniffed {
  if (startsWith(bytes, ZIP)) {
    const pkg = openOoxml(bytes);
    if (pkg.names.some((name) => /(^|\/)vbaProject\.bin$/i.test(name))) throw unsupported(FILE_READ_MESSAGES.macro);
    const has = (name: string) => pkg.names.includes(name);
    if (has("ppt/presentation.xml")) return { kind: "PPTX", pkg };
    if (has("word/document.xml")) return { kind: "DOCX", pkg };
    if (has("xl/workbook.xml")) return { kind: "XLSX", pkg };
    throw unsupported();
  }
  // Encrypted .pptx/.docx/.xlsx and the old .ppt/.doc/.xls formats are all OLE compound files.
  if (startsWith(bytes, OLE)) throw new FileReadError("FILE_ENCRYPTED", FILE_READ_MESSAGES.ole);
  if (startsWith(bytes, PDF)) {
    if (isEncryptedPdf(bytes)) throw new FileReadError("FILE_ENCRYPTED", FILE_READ_MESSAGES.encryptedPdf);
    return { kind: "PDF", pkg: null };
  }
  if (startsWith(bytes, PNG)) return { kind: "PNG", pkg: null };
  if (startsWith(bytes, JPEG)) return { kind: "JPEG", pkg: null };
  throw unsupported();
}
