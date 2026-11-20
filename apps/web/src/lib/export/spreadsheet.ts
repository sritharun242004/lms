import * as XLSX from "xlsx";

// Shared CSV/Excel export helpers, used by both the admin registrations
// export and the admin feedback export. `rows` is already the exact
// shape to export — one object per row, keys become column headers in
// the order they first appear.
export function rowsToCsv(rows: Record<string, unknown>[]): string {
  const sheet = XLSX.utils.json_to_sheet(rows);
  return XLSX.utils.sheet_to_csv(sheet);
}

export function rowsToXlsxBuffer(rows: Record<string, unknown>[], sheetName = "Sheet1"): Buffer {
  const sheet = XLSX.utils.json_to_sheet(rows);
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
