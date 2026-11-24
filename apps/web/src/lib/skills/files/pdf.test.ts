import { describe, expect, it } from "vitest";
import { tinyPdf } from "./fixtures";
import { extractPdf, isEncryptedPdf } from "./pdf";

describe("PDF facts", () => {
  it("reads the version, the page count and the title", () => {
    expect(extractPdf(tinyPdf({ pages: 3, title: "Brand (2026) book" }))).toEqual({ kind: "PDF", version: "1.7", pages: 3, title: "Brand (2026) book" });
  });

  it("reports pages it cannot see as unknown, and no title as null", () => {
    const hidden = new TextEncoder().encode("%PDF-1.5\n1 0 obj << /Type /ObjStm /N 3 >> stream\nxx\nendstream endobj\n%%EOF");
    expect(extractPdf(hidden)).toEqual({ kind: "PDF", version: "1.5", pages: null, title: null });
  });

  it("does not count the page tree as a page", () => {
    expect(extractPdf(tinyPdf({ pages: 1 })).pages).toBe(1);
  });

  it("detects an /Encrypt dictionary", () => {
    expect(isEncryptedPdf(tinyPdf({ encrypted: true }))).toBe(true);
    expect(isEncryptedPdf(tinyPdf())).toBe(false);
  });
});
