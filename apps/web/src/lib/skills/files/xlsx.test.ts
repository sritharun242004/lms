import { describe, expect, it } from "vitest";
import { buildXlsx } from "./fixtures";
import { openOoxml } from "./ooxml";
import { extractXlsx } from "./xlsx";

const facts = (opts: Parameters<typeof buildXlsx>[0] = {}) => extractXlsx(openOoxml(buildXlsx(opts)));

describe("extractXlsx", () => {
  it("reads sheets in workbook order through the workbook rels, not the part numbers", () => {
    const f = facts({
      reverseFiles: true,
      sheets: [
        { name: "Summary", rows: [["Total"]] },
        { name: "Detail", rows: [["Line"], ["a"], ["b"]] },
      ],
    });
    expect(f.sheets.map((s) => [s.name, s.headerRow, s.rows])).toEqual([
      ["Summary", ["Total"], 1],
      ["Detail", ["Line"], 3],
    ]);
  });

  it("reads the header row from shared strings, inline strings and numbers", () => {
    const f = facts({
      sheets: [
        { name: "Shared", rows: [["Month", "Plan & Actual", 2026]] },
        { name: "Inline", rows: [["Region", "Owner"]], inlineStrings: true },
      ],
    });
    expect(f.sheets[0].headerRow).toEqual(["Month", "Plan & Actual", "2026"]);
    expect(f.sheets[1].headerRow).toEqual(["Region", "Owner"]);
    expect(f.sheets[0].dimension).toBe("A1:C1");
  });

  it("counts formulas and keeps the first ten distinct ones", () => {
    const rows = [["A", "B"], ...Array.from({ length: 14 }, (_, i) => [i, { formula: i % 2 === 0 ? `SUM(A1:A${i + 1})` : "A2*2" }])];
    const f = facts({ sheets: [{ name: "Calc", rows }] });
    expect(f.sheets[0].formulas).toBe(14);
    expect(f.sheets[0].formulaSamples).toHaveLength(8);
    expect(f.sheets[0].formulaSamples[0]).toBe("SUM(A1:A1)");
    expect(f.sheets[0].formulaSamples).toContain("A2*2");
    const many = facts({ sheets: [{ name: "Many", rows: Array.from({ length: 12 }, (_, i) => [{ formula: `B${i}+1` }]) }] });
    expect(many.sheets[0].formulaSamples).toHaveLength(10);
  });

  it("reads custom number formats, charts, defined names and the theme", () => {
    const f = facts({ numFmts: ['"$"#,##0', "0.0%"], charts: 2, definedNames: ["Total", "Plan"], theme: { colors: { accent1: "00B050" } } });
    expect(f.numberFormats).toEqual(['"$"#,##0', "0.0%"]);
    expect(f.charts).toBe(2);
    expect(f.definedNames).toEqual(["Total", "Plan"]);
    expect(f.theme?.colors.find((c) => c.slot === "accent1")?.hex).toBe("#00B050");
    expect(f.truncated).toBe(false);
  });

  it("describes at most 20 sheets and marks the facts truncated", () => {
    const f = facts({ sheets: Array.from({ length: 22 }, (_, i) => ({ name: `S${i + 1}`, rows: [["x"]] })) });
    expect(f.sheets).toHaveLength(20);
    expect(f.sheets[19].name).toBe("S20");
    expect(f.truncated).toBe(true);
  });

  it("returns empty facts instead of throwing when the parts are missing", () => {
    expect(extractXlsx({ names: [], parts: new Map(), truncated: false })).toMatchObject({ sheets: [], numberFormats: [], charts: 0, definedNames: [] });
  });
});
