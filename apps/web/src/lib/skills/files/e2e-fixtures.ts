/**
 * Test and E2E tooling only: writes the files the browser run uploads, built by the same
 * fixture builders the unit tests use. Relative imports only (scripts load this through tsx).
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildDocx, buildPptx, buildXlsx, oleHeader, sha256Hex, tinyPdf, tinyPng, type FixtureTheme } from "./fixtures";

export type WrittenFixture = { name: string; path: string; bytes: number; sha256: string };

export const VALID_FIXTURES = ["deck.pptx", "brief.docx", "numbers.xlsx", "brand.pdf", "logo.png", "big-deck.pptx"] as const;
export const LOCKED_FIXTURE = "locked.docx";

const BIG_DECK_BYTES = 12 * 1024 * 1024;

const THEME: FixtureTheme = {
  name: "Acme Board",
  colors: { dk1: "1A1A1A", lt1: "FFFFFF", dk2: "0B2545", lt2: "EEF2F7", accent1: "1F4E79", accent2: "E07A1F", accent3: "2E8B57" },
  majorFont: "Montserrat",
  minorFont: "Source Sans Pro",
};

function deck(padBytes?: number): Uint8Array {
  return buildPptx({
    theme: THEME,
    slideSize: { cx: 12_192_000, cy: 6_858_000 },
    masters: ["Acme Master"],
    layouts: ["Title Slide", "Title and Content", "Two Content"],
    slides: [
      { title: "Q3 board update", body: ["Acme Corp", "October 2026"], layout: 1, colors: ["1F4E79"], fonts: ["Montserrat"] },
      { title: "Revenue and runway", body: ["ARR up 18% quarter on quarter", "Runway 22 months"], layout: 2, chart: true },
      { title: "Hiring plan", body: ["Four engineering hires", "One product designer"], layout: 3, table: true, picture: true },
    ],
    ...(padBytes ? { padBytes } : {}),
  });
}

async function build(options: { bigDeckBytes?: number }): Promise<Record<string, Uint8Array>> {
  return {
    "deck.pptx": deck(),
    "brief.docx": buildDocx({
      theme: THEME,
      defaults: { font: "Source Sans Pro", sizePt: 11 },
      styles: [
        { id: "Title", name: "Title", font: "Montserrat", sizePt: 28, color: "0B2545", bold: true },
        { id: "Heading1", name: "heading 1", font: "Montserrat", sizePt: 16, color: "1F4E79", bold: true, basedOn: "Normal" },
      ],
      paragraphs: [
        { text: "Board brief", style: "Title" },
        { text: "Summary", style: "Heading1" },
        { text: "Numbers first, no surprises. One page, plain words." },
        { text: "Risks", style: "Heading1" },
        { text: "Name each risk with an owner and a date." },
      ],
      page: { widthIn: 8.27, heightIn: 11.69, orientation: "portrait" },
      tables: 1,
    }),
    "numbers.xlsx": buildXlsx({
      theme: THEME,
      sheets: [
        {
          name: "Monthly KPIs",
          rows: [
            ["Month", "ARR", "Burn", "Runway (months)"],
            ["2026-08", 1_200_000, 180_000, { formula: "B2/C2", value: 6.67 }],
            ["2026-09", 1_310_000, 175_000, { formula: "B3/C3", value: 7.49 }],
          ],
        },
        { name: "Headcount", rows: [["Team", "Now", "Plan"], ["Engineering", 14, 18]], inlineStrings: true },
      ],
      numFmts: ['"$"#,##0', "0.0%"],
      definedNames: ["Runway"],
      charts: 1,
    }),
    "brand.pdf": tinyPdf({ pages: 3, title: "Acme brand book" }),
    "logo.png": await tinyPng(320, 120),
    "big-deck.pptx": deck(options.bigDeckBytes ?? BIG_DECK_BYTES),
    [LOCKED_FIXTURE]: oleHeader(),
  };
}

export async function writeSkillFixtures(outDir: string, options: { bigDeckBytes?: number } = {}): Promise<WrittenFixture[]> {
  await mkdir(outDir, { recursive: true });
  const files = await build(options);
  const written: WrittenFixture[] = [];
  for (const [name, bytes] of Object.entries(files)) {
    const target = path.join(outDir, name);
    await writeFile(target, bytes);
    written.push({ name, path: target, bytes: bytes.byteLength, sha256: sha256Hex(bytes) });
  }
  return written;
}
