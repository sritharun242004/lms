import { readTheme, relTargets, type OoxmlPackage } from "./ooxml";
import type { SheetFacts, XlsxFacts } from "./types";
import { attr, collapse, decodeXml, elements, first, textOf, type XmlElement } from "./xml";

const MAX_SHEETS = 20;
const MAX_HEADER_CELLS = 30;
const MAX_FORMULA_SAMPLES = 10;
const MAX_NUMBER_FORMATS = 20;
const MAX_DEFINED_NAMES = 30;
const ROW = /<(?:[A-Za-z_][\w.-]*:)?row(?=[\s/>])/g;

/** Facts from an Excel package (spec, stage 2, XLSX). Missing parts give empty facts, never an exception. */
export function extractXlsx(pkg: OoxmlPackage): XlsxFacts {
  let truncated = pkg.truncated;
  const workbook = pkg.parts.get("xl/workbook.xml") ?? "";
  const rels = relTargets(pkg.parts.get("xl/_rels/workbook.xml.rels"), "xl/workbook.xml");
  const shared = elements(pkg.parts.get("xl/sharedStrings.xml") ?? "", "si");

  const cellText = (cell: XmlElement): string => {
    const type = attr(cell, "t");
    if (type === "s") return collapse(textOf(shared[Number(textOf(cell.inner, "v"))]?.inner ?? ""), 80);
    if (type === "inlineStr") return collapse(textOf(first(cell.inner, "is")?.inner ?? ""), 80);
    return collapse(decodeXml(first(cell.inner, "v")?.inner ?? ""), 80);
  };

  const sheetElements = elements(first(workbook, "sheets")?.inner ?? "", "sheet");
  if (sheetElements.length > MAX_SHEETS) truncated = true;
  const sheets: SheetFacts[] = sheetElements.slice(0, MAX_SHEETS).map((sheet) => {
    const name = collapse(attr(sheet, "name") ?? "", 100);
    const path = rels.get(attr(sheet, "r:id") ?? "");
    const xml = path ? pkg.parts.get(path) : undefined;
    if (xml === undefined) {
      truncated = true;
      return { name, dimension: null, rows: 0, headerRow: [], formulas: 0, formulaSamples: [] };
    }
    const firstRow = first(xml, "row");
    const formulas = elements(xml, "f");
    const samples: string[] = [];
    for (const f of formulas) {
      const text = collapse(decodeXml(f.inner), 120);
      if (text && !samples.includes(text) && samples.length < MAX_FORMULA_SAMPLES) samples.push(text);
    }
    return {
      name,
      dimension: attr(first(xml, "dimension"), "ref"),
      rows: xml.match(ROW)?.length ?? 0,
      headerRow: firstRow ? elements(firstRow.inner, "c").slice(0, MAX_HEADER_CELLS).map(cellText) : [],
      formulas: formulas.length,
      formulaSamples: samples,
    };
  });

  const numberFormats = elements(pkg.parts.get("xl/styles.xml") ?? "", "numFmt").flatMap((fmt) => {
    const code = attr(fmt, "formatCode");
    return code ? [collapse(code, 100)] : [];
  });
  const definedNames = elements(first(workbook, "definedNames")?.inner ?? "", "definedName").flatMap((el) => {
    const name = attr(el, "name");
    return name ? [collapse(name, 100)] : [];
  });
  if (numberFormats.length > MAX_NUMBER_FORMATS || definedNames.length > MAX_DEFINED_NAMES) truncated = true;

  return {
    kind: "XLSX",
    theme: readTheme(pkg.parts.get("xl/theme/theme1.xml")),
    sheets,
    numberFormats: numberFormats.slice(0, MAX_NUMBER_FORMATS),
    charts: pkg.names.filter((n) => /^xl\/charts\/chart\d+\.xml$/.test(n)).length,
    definedNames: definedNames.slice(0, MAX_DEFINED_NAMES),
    truncated,
  };
}
