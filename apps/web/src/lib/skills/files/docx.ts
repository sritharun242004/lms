import { readTheme, toHex, type OoxmlPackage } from "./ooxml";
import type { DocxFacts, DocxStyle } from "./types";
import { attr, collapse, elements, first, textOf, type XmlElement } from "./xml";

const STYLE_TYPES = new Set<DocxStyle["type"]>(["paragraph", "character", "table", "numbering"]);
const ALWAYS_KEPT = new Set(["Normal", "Title", "Heading1", "Heading2", "Heading3", "Heading4", "Heading5", "Heading6"]);
const MAX_STYLES = 40;
const MAX_HEADINGS = 100;
const TEXT_SAMPLE_CHARS = 4000;
const TWIPS_PER_INCH = 1440;
const round2 = (value: number) => Math.round(value * 100) / 100;

function fontOf(rPr: string | undefined): string | null {
  const fonts = rPr ? first(rPr, "rFonts") : null;
  const face = attr(fonts, "ascii") ?? attr(fonts, "hAnsi");
  return face ? collapse(face, 100) : null;
}
function sizeOf(rPr: string | undefined): number | null {
  const halfPoints = Number(attr(rPr ? first(rPr, "sz") : null, "val"));
  return halfPoints > 0 ? halfPoints / 2 : null;
}
function colorOf(rPr: string | undefined): string | null {
  return toHex(attr(rPr ? first(rPr, "color") : null, "val"));
}
function boldOf(rPr: string | undefined): boolean {
  const b = rPr ? first(rPr, "b") : null;
  return b !== null && !["0", "false"].includes(attr(b, "val") ?? "");
}

function readStyle(el: XmlElement): DocxStyle {
  const id = attr(el, "styleId") ?? "";
  const type = (attr(el, "type") ?? "paragraph") as DocxStyle["type"];
  const rPr = first(el.inner, "rPr")?.inner;
  return {
    id,
    name: collapse(attr(first(el.inner, "name"), "val") ?? id, 100),
    type: STYLE_TYPES.has(type) ? type : "paragraph",
    basedOn: attr(first(el.inner, "basedOn"), "val"),
    font: fontOf(rPr),
    sizePt: sizeOf(rPr),
    color: colorOf(rPr),
    bold: boldOf(rPr),
  };
}

/** Title is level 0; HeadingN (by id) or "heading N" (by name) is level N. */
function headingLevel(styleId: string | null, byId: Map<string, DocxStyle>): number | null {
  if (!styleId) return null;
  const name = byId.get(styleId)?.name ?? "";
  if (styleId === "Title" || /^title$/i.test(name)) return 0;
  const match = /^heading\s?([1-6])$/i.exec(styleId) ?? /^heading ([1-6])$/i.exec(name);
  return match ? Number(match[1]) : null;
}

/** Facts from a Word package (spec, stage 2, DOCX). Missing parts give empty facts, never an exception. */
export function extractDocx(pkg: OoxmlPackage): DocxFacts {
  let truncated = pkg.truncated;
  const document = pkg.parts.get("word/document.xml") ?? "";
  const stylesXml = pkg.parts.get("word/styles.xml") ?? "";

  const defaultRPr = first(first(stylesXml, "docDefaults")?.inner ?? "", "rPr")?.inner;
  const allStyles = elements(stylesXml, "style").map(readStyle);
  const byId = new Map(allStyles.map((s) => [s.id, s]));

  const body = first(document, "body")?.inner ?? document;
  const used = new Set<string>();
  for (const ref of [...elements(body, "pStyle"), ...elements(body, "rStyle"), ...elements(body, "tblStyle")]) {
    const id = attr(ref, "val");
    if (id) used.add(id);
  }

  const headings: DocxFacts["headings"] = [];
  const paragraphs = elements(body, "p");
  let sample = "";
  for (const paragraph of paragraphs) {
    const text = collapse(textOf(paragraph.inner));
    if (!text) continue;
    const level = headingLevel(attr(first(first(paragraph.inner, "pPr")?.inner ?? "", "pStyle"), "val"), byId);
    if (level !== null) {
      if (headings.length < MAX_HEADINGS) headings.push({ level, text: text.slice(0, 200) });
      else truncated = true;
    }
    if (sample.length < TEXT_SAMPLE_CHARS) sample = sample ? `${sample}\n${text}` : text;
  }
  if (sample.length > TEXT_SAMPLE_CHARS) {
    sample = sample.slice(0, TEXT_SAMPLE_CHARS);
    truncated = true;
  }

  const kept = allStyles.filter((s) => used.has(s.id) || ALWAYS_KEPT.has(s.id));
  if (kept.length > MAX_STYLES) truncated = true;

  const pgSz = first(elements(document, "sectPr").at(-1)?.inner ?? "", "pgSz");
  const width = Number(attr(pgSz, "w"));
  const height = Number(attr(pgSz, "h"));
  const page =
    width > 0 && height > 0
      ? {
          widthIn: round2(width / TWIPS_PER_INCH),
          heightIn: round2(height / TWIPS_PER_INCH),
          orientation: attr(pgSz, "orient") === "landscape" || width > height ? ("landscape" as const) : ("portrait" as const),
        }
      : null;

  return {
    kind: "DOCX",
    theme: readTheme(pkg.parts.get("word/theme/theme1.xml")),
    defaults: { font: fontOf(defaultRPr), sizePt: sizeOf(defaultRPr) },
    styles: kept.slice(0, MAX_STYLES),
    headings,
    paragraphs: paragraphs.length,
    tables: elements(body, "tbl").length,
    images: elements(body, "drawing").length,
    page,
    textSample: sample,
    truncated,
  };
}
