import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { rowsToCsv, rowsToXlsxBuffer } from "./spreadsheet";

const ROWS = [
  { Name: "Asha Rao", Email: "asha@example.com", Amount: 28250 },
  { Name: "Ravi, Kumar", Email: "ravi@example.com", Amount: 28250 },
];

describe("rowsToCsv", () => {
  it("produces a header row and one row per record, with real headers", () => {
    const csv = rowsToCsv(ROWS);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("Name,Email,Amount");
    expect(lines.length).toBe(3);
    expect(csv).toContain("asha@example.com");
  });

  it("escapes a value containing a comma", () => {
    const csv = rowsToCsv(ROWS);
    expect(csv).toContain('"Ravi, Kumar"');
  });

  it("returns just a header line for an empty row set", () => {
    const csv = rowsToCsv([]);
    expect(csv.trim()).toBe("");
  });

  it("neutralizes a formula-triggering value so Excel/Sheets never auto-executes it", () => {
    const csv = rowsToCsv([{ Name: '=HYPERLINK("http://evil.example","click")', Feedback: "+1 the session" }]);
    expect(csv).not.toMatch(/^=|,=/);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'+1 the session");
  });

  it("leaves an ordinary value starting with a non-trigger character untouched", () => {
    const csv = rowsToCsv([{ Name: "Asha Rao" }]);
    expect(csv).toContain("Asha Rao");
    expect(csv).not.toContain("'Asha Rao");
  });
});

describe("rowsToXlsxBuffer", () => {
  it("produces a real, parseable XLSX workbook with the submitted data", () => {
    const buffer = rowsToXlsxBuffer(ROWS, "Feedback");
    const workbook = XLSX.read(buffer, { type: "buffer" });
    expect(workbook.SheetNames).toEqual(["Feedback"]);
    const sheet = workbook.Sheets["Feedback"];
    const rows = XLSX.utils.sheet_to_json(sheet);
    expect(rows).toEqual(ROWS);
  });

  it("neutralizes a formula-triggering value in the XLSX output too", () => {
    const buffer = rowsToXlsxBuffer([{ Name: "@SUM(1,2)" }]);
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]) as Record<string, unknown>[];
    expect(rows[0].Name).toBe("'@SUM(1,2)");
  });
});
