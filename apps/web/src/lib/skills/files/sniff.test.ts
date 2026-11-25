import { describe, expect, it } from "vitest";
import { buildDocx, buildPptx, buildXlsx, oleHeader, tinyJpeg, tinyPdf, tinyPng, zip } from "./fixtures";
import { sniffFile } from "./sniff";
import { FILE_READ_MESSAGES, FileReadError } from "./types";

const failure = (bytes: Uint8Array) => {
  try {
    sniffFile(bytes);
  } catch (error) {
    if (error instanceof FileReadError) return { code: error.code, status: error.status, message: error.message };
    throw error;
  }
  throw new Error("expected a FileReadError");
};

describe("sniffFile", () => {
  it("tells each supported kind from its bytes", async () => {
    expect(sniffFile(buildPptx()).kind).toBe("PPTX");
    expect(sniffFile(buildDocx()).kind).toBe("DOCX");
    expect(sniffFile(buildXlsx()).kind).toBe("XLSX");
    expect(sniffFile(tinyPdf())).toEqual({ kind: "PDF", pkg: null });
    expect(sniffFile(await tinyPng())).toEqual({ kind: "PNG", pkg: null });
    expect(sniffFile(await tinyJpeg())).toEqual({ kind: "JPEG", pkg: null });
  });

  it("hands the opened package to the OOXML extractors", () => {
    const sniffed = sniffFile(buildDocx());
    expect(sniffed.pkg?.parts.has("word/styles.xml")).toBe(true);
  });

  it("refuses OLE files (encrypted Office or the old formats) as encrypted", () => {
    expect(failure(oleHeader())).toEqual({ code: "FILE_ENCRYPTED", status: 422, message: FILE_READ_MESSAGES.ole });
  });

  it("refuses a password-protected PDF", () => {
    expect(failure(tinyPdf({ encrypted: true }))).toEqual({ code: "FILE_ENCRYPTED", status: 422, message: FILE_READ_MESSAGES.encryptedPdf });
  });

  it("refuses macro-enabled packages", () => {
    expect(failure(buildPptx({ macro: true }))).toEqual({ code: "UNSUPPORTED_FILE", status: 415, message: FILE_READ_MESSAGES.macro });
  });

  it("refuses empty, random and non-Office zip bytes as unsupported", () => {
    const unsupported = { code: "UNSUPPORTED_FILE", status: 415, message: FILE_READ_MESSAGES.unsupported };
    expect(failure(new Uint8Array(0))).toEqual(unsupported);
    expect(failure(new TextEncoder().encode("just some text, not a file we read"))).toEqual(unsupported);
    expect(failure(zip({ "notes.txt": "hello", "data.xml": "<x/>" }))).toEqual(unsupported);
  });

  it("refuses a damaged zip as unreadable", () => {
    expect(failure(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6, 7, 8])).code).toBe("FILE_UNREADABLE");
  });
});
