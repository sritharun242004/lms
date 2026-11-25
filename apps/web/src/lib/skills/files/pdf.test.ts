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

  it("ignores the literal /Encrypt inside page content and finds a real trailer entry", () => {
    const body = "%PDF-1.7\n1 0 obj\n<< /Length 20 >>\nstream\n(see /Encrypt here)\nendstream\nendobj\n" + "x".repeat(10_000) + "\ntrailer\n<< /Size 2 /Root 1 0 R >>\nstartxref\n0\n%%EOF\n";
    expect(isEncryptedPdf(new Uint8Array(Buffer.from(body, "latin1")))).toBe(false);
    expect(isEncryptedPdf(new Uint8Array(Buffer.from(body.replace("/Size 2", "/Size 2 /Encrypt 5 0 R"), "latin1")))).toBe(true);
  });

  it("finds /Encrypt in an xref-stream dictionary at the startxref offset", () => {
    const head = "%PDF-1.7\n";
    const dict = "5 0 obj\n<< /Type /XRef /Size 6 /Root 1 0 R /Encrypt 4 0 R /Length 3 >>\nstream\nabc\nendstream\nendobj\n";
    const text = head + dict + "y".repeat(10_000) + "\nstartxref\n" + head.length + "\n%%EOF\n";
    expect(isEncryptedPdf(new Uint8Array(Buffer.from(text, "latin1")))).toBe(true);
  });

  it("detects an /Encrypt dictionary", () => {
    expect(isEncryptedPdf(tinyPdf({ encrypted: true }))).toBe(true);
    expect(isEncryptedPdf(tinyPdf())).toBe(false);
  });
});
