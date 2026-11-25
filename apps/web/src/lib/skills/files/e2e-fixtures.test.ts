import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LOCKED_FIXTURE, VALID_FIXTURES, writeSkillFixtures, type WrittenFixture } from "./e2e-fixtures";
import { readUpload } from "./extract";
import { sha256Hex } from "./fixtures";
import { FileReadError } from "./types";

const EXPECTED_KIND: Record<(typeof VALID_FIXTURES)[number], string> = {
  "deck.pptx": "PPTX",
  "brief.docx": "DOCX",
  "numbers.xlsx": "XLSX",
  "brand.pdf": "PDF",
  "logo.png": "PNG",
  "big-deck.pptx": "PPTX",
};

let dir = "";
let written: WrittenFixture[] = [];

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "skill-fixtures-"));
  // A small padded deck keeps the test fast; the CLI default is 12 MB.
  written = await writeSkillFixtures(dir, { bigDeckBytes: 256 * 1024 });
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("writeSkillFixtures", () => {
  it("writes every browser-run fixture with its size and SHA-256", async () => {
    expect(written.map((f) => f.name).sort()).toEqual([...VALID_FIXTURES, LOCKED_FIXTURE].sort());
    for (const file of written) {
      const bytes = new Uint8Array(await readFile(file.path));
      expect(file.path).toBe(path.join(dir, file.name));
      expect(file.bytes).toBe(bytes.byteLength);
      expect(file.sha256).toBe(sha256Hex(bytes));
    }
  });

  it("pads big-deck.pptx to the requested size", () => {
    const big = written.find((f) => f.name === "big-deck.pptx")!;
    expect(big.bytes).toBeGreaterThanOrEqual(256 * 1024);
  });

  it("produces files the upload reader accepts, each as its own kind", async () => {
    for (const name of VALID_FIXTURES) {
      const bytes = new Uint8Array(await readFile(path.join(dir, name)));
      const result = await readUpload(bytes);
      expect(result.kind, name).toBe(EXPECTED_KIND[name]);
      expect(result.facts.kind, name).toBe(EXPECTED_KIND[name]);
    }
  });

  it("gives the deck real theme colours for the analysis to quote", async () => {
    const result = await readUpload(new Uint8Array(await readFile(path.join(dir, "deck.pptx"))));
    if (result.facts.kind !== "PPTX") throw new Error("expected PPTX facts");
    expect(result.facts.theme?.colors).toContainEqual({ slot: "accent1", hex: "#1F4E79" });
    expect(result.facts.slideCount).toBe(3);
  });

  it("makes locked.docx an OLE file that the reader refuses as encrypted", async () => {
    const bytes = new Uint8Array(await readFile(path.join(dir, LOCKED_FIXTURE)));
    const error = await readUpload(bytes).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FileReadError);
    expect((error as FileReadError).code).toBe("FILE_ENCRYPTED");
  });
});
