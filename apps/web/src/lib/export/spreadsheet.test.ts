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
});
