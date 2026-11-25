import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ explode: false }));
vi.mock("./pptx", async (orig) => {
  const real = await orig<typeof import("./pptx")>();
  return {
    extractPptx: (...args: Parameters<typeof real.extractPptx>) => {
      if (mocks.explode) throw new TypeError("boom");
      return real.extractPptx(...args);
    },
  };
});

import { boundFacts, readUpload } from "./extract";
import { buildPptx, sha256Hex, tinyPdf, tinyPng } from "./fixtures";
import { FileReadError, KIND_MIME, type PptxFacts } from "./types";

beforeEach(() => {
  mocks.explode = false;
});

describe("readUpload", () => {
  it("returns the sniffed kind, the canonical MIME type, the facts and the SHA-256", async () => {
    const bytes = buildPptx();
    const read = await readUpload(bytes);
    expect(read.kind).toBe("PPTX");
    expect(read.mimeType).toBe(KIND_MIME.PPTX);
    expect(read.sha256).toBe(sha256Hex(bytes));
    expect(read.facts.kind).toBe("PPTX");
  });

  it("goes by the bytes, so a PNG is a PNG whatever it was called", async () => {
    const read = await readUpload(await tinyPng(8, 6));
    expect(read).toMatchObject({ kind: "PNG", mimeType: "image/png", facts: { kind: "PNG", width: 8, height: 6 } });
    expect((await readUpload(tinyPdf({ pages: 2 }))).facts).toMatchObject({ kind: "PDF", pages: 2 });
  });

  it("reports an extractor crash as an unreadable file, not a server error", async () => {
    mocks.explode = true;
    const error = await readUpload(buildPptx()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FileReadError);
    expect((error as FileReadError).code).toBe("FILE_UNREADABLE");
  });

  it("passes sniffing refusals through unchanged", async () => {
    const error = await readUpload(new Uint8Array([1, 2, 3])).catch((e: unknown) => e);
    expect((error as FileReadError).code).toBe("UNSUPPORTED_FILE");
  });
});

describe("boundFacts", () => {
  const huge = (): PptxFacts => ({
    kind: "PPTX",
    slideSize: null,
    theme: null,
    themes: [],
    masters: [],
    layouts: [],
    slideCount: 400,
    slides: Array.from({ length: 400 }, (_, i) => ({ index: i + 1, layout: null, title: `Slide ${i}`, placeholders: ["title"], text: "x".repeat(300), tables: 0, charts: 0, images: 0 })),
    colorsUsed: [],
    fontsUsed: [],
    truncated: false,
  });

  it("leaves facts that fit alone", () => {
    const small = { kind: "PDF" as const, version: "1.7", pages: 1, title: null };
    expect(boundFacts(small)).toBe(small);
  });

  it("trims oversized facts under 64 KB and marks them truncated", () => {
    const input = huge();
    const bounded = boundFacts(input) as PptxFacts;
    expect(Buffer.byteLength(JSON.stringify(bounded))).toBeLessThanOrEqual(64 * 1024);
    expect(bounded.truncated).toBe(true);
    expect(bounded.slides.length).toBeGreaterThan(100);
    expect(bounded.slides.length).toBeLessThan(400);
    expect(bounded.slideCount).toBe(400);
    expect(input.slides).toHaveLength(400);
  });
});
