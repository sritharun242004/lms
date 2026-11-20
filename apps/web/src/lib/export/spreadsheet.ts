import * as XLSX from "xlsx";

// Both exports include genuinely user-submitted text (feedback answers,
// registration names/addresses). A value opening with =, +, -, or @ is
// a formula trigger in Excel/Sheets/LibreOffice the instant an admin
// opens the file — classic CSV/spreadsheet formula injection (OWASP).
// Prefixing with a single quote forces it to render as literal text in
// every one of those apps without changing the visible value.
const FORMULA_TRIGGER = /^[=+\-@]/;

function sanitizeCell(value: unknown): unknown {
  if (typeof value === "string" && FORMULA_TRIGGER.test(value)) {
    return `'${value}`;
  }
  return value;
}

function sanitizeRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((row) => {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      sanitized[key] = sanitizeCell(value);
    }
    return sanitized;
  });
}

// Shared CSV/Excel export helpers, used by both the admin registrations
// export and the admin feedback export. `rows` is already the exact
// shape to export — one object per row, keys become column headers in
// the order they first appear.
export function rowsToCsv(rows: Record<string, unknown>[]): string {
  const sheet = XLSX.utils.json_to_sheet(sanitizeRows(rows));
  return XLSX.utils.sheet_to_csv(sheet);
}

export function rowsToXlsxBuffer(rows: Record<string, unknown>[], sheetName = "Sheet1"): Buffer {
  const sheet = XLSX.utils.json_to_sheet(sanitizeRows(rows));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function csvResponseHeaders(filename: string): HeadersInit {
  return {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
  };
}

export function xlsxResponseHeaders(filename: string): HeadersInit {
  return {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${filename}"`,
  };
}
