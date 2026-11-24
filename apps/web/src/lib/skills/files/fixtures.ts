/**
 * Test-only builders for real, minimal Office packages, PDFs and images (spec, Testing: fixtures are generated,
 * never committed). Imported by unit tests and scripts/make-skill-fixtures.ts; never by product code.
 */
import { createHash, randomBytes } from "node:crypto";
import { strToU8, zipSync, type Zippable } from "fflate";
import sharp from "sharp";
import { THEME_SLOTS, type ThemeSlot } from "./types";

export type FixtureTheme = { name?: string; colors?: Partial<Record<ThemeSlot, string>>; sysDk1?: boolean; majorFont?: string; minorFont?: string };
/** `layout` is the 1-based layout used; 0 writes the slide with no rels part at all. Layout 1 uses a ctrTitle placeholder. */
export type FixtureSlide = { title?: string; body?: string[]; layout?: number; table?: boolean; chart?: boolean; picture?: boolean; colors?: string[]; fonts?: string[] };
export type FixtureStyle = { id: string; name: string; type?: "paragraph" | "character" | "table"; font?: string; sizePt?: number; color?: string; bold?: boolean; basedOn?: string };
export type FixtureCell = string | number | { formula: string; value?: number };

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS = {
  a: "http://schemas.openxmlformats.org/drawingml/2006/main",
  p: "http://schemas.openxmlformats.org/presentationml/2006/main",
  r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  w: "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
  s: "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
  rel: "http://schemas.openxmlformats.org/package/2006/relationships",
  ct: "http://schemas.openxmlformats.org/package/2006/content-types",
  odr: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
};
const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function zip(entries: Record<string, string | Uint8Array>, level: 0 | 6 = 6): Uint8Array {
  const zippable: Zippable = {};
  for (const [name, value] of Object.entries(entries)) zippable[name] = [typeof value === "string" ? strToU8(value) : value, { level }];
  return zipSync(zippable);
}

type Rel = { id: string; type: string; target: string };
const rels = (list: Rel[]) =>
  `${XML}<Relationships xmlns="${NS.rel}">${list.map((r) => `<Relationship Id="${r.id}" Type="${NS.odr}/${r.type}" Target="${esc(r.target)}"/>`).join("")}</Relationships>`;
const contentTypes = (overrides: [string, string][]) =>
  `${XML}<Types xmlns="${NS.ct}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${overrides
    .map(([part, type]) => `<Override PartName="/${part}" ContentType="${type}"/>`)
    .join("")}</Types>`;

const DEFAULT_COLORS: Record<ThemeSlot, string> = {
  dk1: "000000", lt1: "FFFFFF", dk2: "1F497D", lt2: "EEECE1", accent1: "4F81BD", accent2: "C0504D",
  accent3: "9BBB59", accent4: "8064A2", accent5: "4BACC6", accent6: "F79646", hlink: "0000FF", folHlink: "800080",
};

/** Colours are hex without '#'. */
export function themeXml(theme: FixtureTheme = {}): string {
  const colors = { ...DEFAULT_COLORS, ...theme.colors };
  const slot = (s: ThemeSlot) =>
    s === "dk1" && theme.sysDk1
      ? `<a:dk1><a:sysClr val="windowText" lastClr="${colors.dk1}"/></a:dk1>`
      : `<a:${s}><a:srgbClr val="${colors[s]}"/></a:${s}>`;
  return `${XML}<a:theme xmlns:a="${NS.a}" name="${esc(theme.name ?? "Office Theme")}"><a:themeElements><a:clrScheme name="Office">${THEME_SLOTS.map(slot).join(
    "",
  )}</a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="${esc(theme.majorFont ?? "Calibri Light")}"/><a:ea typeface=""/></a:majorFont><a:minorFont><a:latin typeface="${esc(
    theme.minorFont ?? "Calibri",
  )}"/><a:ea typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"/></a:themeElements></a:theme>`;
}

function run(text: string, color?: string, font?: string) {
  const fill = color ? `<a:solidFill><a:srgbClr val="${color}"/></a:solidFill>` : "";
  const latin = font ? `<a:latin typeface="${esc(font)}"/>` : "";
  return `<a:r><a:rPr lang="en-US" dirty="0">${fill}${latin}</a:rPr><a:t>${esc(text)}</a:t></a:r>`;
}

function slideXml(slide: FixtureSlide, n: number): string {
  const colors = slide.colors ?? [];
  const fonts = slide.fonts ?? [];
  const shapes: string[] = [];
  if (slide.title !== undefined) {
    const type = slide.layout === 1 ? "ctrTitle" : "title";
    shapes.push(
      `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr/><p:nvPr><p:ph type="${type}"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:p>${run(slide.title, colors[0], fonts[0])}</a:p></p:txBody></p:sp>`,
    );
  }
  if (slide.body?.length) {
    shapes.push(
      `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Content 2"/><p:cNvSpPr/><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/>${slide.body
        .map((line, i) => `<a:p>${run(line, colors[i + 1], fonts[i + 1])}</a:p>`)
        .join("")}</p:txBody></p:sp>`,
    );
  }
  const frame = (uri: string, inner: string) =>
    `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${n + 10}" name="Frame"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm/><a:graphic><a:graphicData uri="${uri}">${inner}</a:graphicData></a:graphic></p:graphicFrame>`;
  if (slide.table) shapes.push(frame(`${NS.a.replace("/main", "/table")}`, `<a:tbl><a:tblPr/><a:tr h="370840"><a:tc><a:txBody><a:bodyPr/><a:p>${run("Cell")}</a:p></a:txBody></a:tc></a:tr></a:tbl>`));
  if (slide.chart) shapes.push(frame("http://schemas.openxmlformats.org/drawingml/2006/chart", `<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId9"/>`));
  if (slide.picture) shapes.push(`<p:pic><p:nvPicPr><p:cNvPr id="${n + 20}" name="Picture"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId8"/></p:blipFill><p:spPr/></p:pic>`);
  return `${XML}<p:sld xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${shapes.join(
    "",
  )}</p:spTree></p:cSld></p:sld>`;
}

const cSld = (name: string | null) => (name === null ? "<p:cSld>" : `<p:cSld name="${esc(name)}">`);

/**
 * A real PowerPoint package. `order` lists slide part numbers in presentation order (default 1..n), so tests can make
 * sldIdLst disagree with file numbers. `padBytes` adds an incompressible ppt/media/pad.bin (stored) to reach a size.
 */
export function buildPptx(
  opts: {
    slides?: FixtureSlide[];
    theme?: FixtureTheme;
    slideSize?: { cx: number; cy: number };
    layouts?: (string | null)[];
    masters?: (string | null)[];
    order?: number[];
    macro?: boolean;
    padBytes?: number;
  } = {},
): Uint8Array {
  const slides = opts.slides ?? [{ title: "Quarterly board update", body: ["Revenue grew 12%"], layout: 2 }];
  const layouts = opts.layouts ?? ["Title Slide", "Title and Content"];
  const masters = opts.masters ?? ["Office Theme"];
  const size = opts.slideSize ?? { cx: 12_192_000, cy: 6_858_000 };
  const order = opts.order ?? slides.map((_, i) => i + 1);
  const entries: Zippable = {};
  const put = (name: string, value: string) => (entries[name] = strToU8(value));
  const P = "application/vnd.openxmlformats-officedocument.presentationml";
  const overrides: [string, string][] = [
    ["ppt/presentation.xml", `${P}.presentation.main+xml`],
    ["ppt/theme/theme1.xml", "application/vnd.openxmlformats-officedocument.theme+xml"],
  ];
  put("_rels/.rels", rels([{ id: "rId1", type: "officeDocument", target: "ppt/presentation.xml" }]));

  const presRels: Rel[] = [{ id: "rId1", type: "theme", target: "theme/theme1.xml" }];
  masters.forEach((_, i) => presRels.push({ id: `rIdM${i + 1}`, type: "slideMaster", target: `slideMasters/slideMaster${i + 1}.xml` }));
  slides.forEach((_, i) => presRels.push({ id: `rIdS${i + 1}`, type: "slide", target: `slides/slide${i + 1}.xml` }));
  put("ppt/_rels/presentation.xml.rels", rels(presRels));
  put(
    "ppt/presentation.xml",
    `${XML}<p:presentation xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}"><p:sldMasterIdLst>${masters
      .map((_, i) => `<p:sldMasterId id="${2147483648 + i}" r:id="rIdM${i + 1}"/>`)
      .join("")}</p:sldMasterIdLst><p:sldIdLst>${order.map((n, i) => `<p:sldId id="${256 + i}" r:id="rIdS${n}"/>`).join("")}</p:sldIdLst><p:sldSz cx="${size.cx}" cy="${size.cy}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
  );
  put("ppt/theme/theme1.xml", themeXml(opts.theme));

  masters.forEach((name, i) => {
    const part = `ppt/slideMasters/slideMaster${i + 1}.xml`;
    overrides.push([part, `${P}.slideMaster+xml`]);
    put(part, `${XML}<p:sldMaster xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}">${cSld(name)}<p:spTree/></p:cSld><p:sldLayoutIdLst>${layouts
      .map((_, j) => `<p:sldLayoutId id="${2147483649 + j}" r:id="rIdL${j + 1}"/>`)
      .join("")}</p:sldLayoutIdLst></p:sldMaster>`);
    put(
      `ppt/slideMasters/_rels/slideMaster${i + 1}.xml.rels`,
      rels([...layouts.map((_, j) => ({ id: `rIdL${j + 1}`, type: "slideLayout", target: `../slideLayouts/slideLayout${j + 1}.xml` })), { id: "rIdT", type: "theme", target: "../theme/theme1.xml" }]),
    );
  });
  layouts.forEach((name, j) => {
    const part = `ppt/slideLayouts/slideLayout${j + 1}.xml`;
    overrides.push([part, `${P}.slideLayout+xml`]);
    put(part, `${XML}<p:sldLayout xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}">${cSld(name)}<p:spTree/></p:cSld></p:sldLayout>`);
    put(`ppt/slideLayouts/_rels/slideLayout${j + 1}.xml.rels`, rels([{ id: "rId1", type: "slideMaster", target: "../slideMasters/slideMaster1.xml" }]));
  });
  slides.forEach((slide, i) => {
    const part = `ppt/slides/slide${i + 1}.xml`;
    overrides.push([part, `${P}.slide+xml`]);
    put(part, slideXml(slide, i + 1));
    const layout = slide.layout ?? Math.min(2, layouts.length);
    if (layout > 0) put(`ppt/slides/_rels/slide${i + 1}.xml.rels`, rels([{ id: "rId1", type: "slideLayout", target: `../slideLayouts/slideLayout${layout}.xml` }]));
  });
  if (opts.macro) entries["ppt/vbaProject.bin"] = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]);
  if (opts.padBytes) entries["ppt/media/pad.bin"] = [new Uint8Array(randomBytes(opts.padBytes)), { level: 0 }];
  put("[Content_Types].xml", contentTypes(overrides));
  return zipSync(entries);
}

const wRun = (text: string) => `<w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;

function styleXml(style: FixtureStyle): string {
  const rPr = [
    style.font ? `<w:rFonts w:ascii="${esc(style.font)}" w:hAnsi="${esc(style.font)}"/>` : "",
    style.bold ? "<w:b/><w:bCs/>" : "",
    style.color ? `<w:color w:val="${style.color}"/>` : "",
    style.sizePt ? `<w:sz w:val="${style.sizePt * 2}"/><w:szCs w:val="${style.sizePt * 2}"/>` : "",
  ].join("");
  return `<w:style w:type="${style.type ?? "paragraph"}" w:styleId="${esc(style.id)}"><w:name w:val="${esc(style.name)}"/>${
    style.basedOn ? `<w:basedOn w:val="${esc(style.basedOn)}"/>` : ""
  }<w:qFormat/>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ""}</w:style>`;
}

export const DEFAULT_DOCX_STYLES: FixtureStyle[] = [
  { id: "Normal", name: "Normal" },
  { id: "Title", name: "Title", basedOn: "Normal", font: "Georgia", sizePt: 28, color: "1F4E79" },
  { id: "Heading1", name: "heading 1", basedOn: "Normal", font: "Georgia", sizePt: 16, color: "2F5496", bold: true },
  { id: "Heading2", name: "heading 2", basedOn: "Normal", font: "Georgia", sizePt: 13, color: "2F5496" },
  { id: "Quote", name: "Quote", basedOn: "Normal", color: "auto" },
];

/** A real Word package: paragraphs, then `tables` one-cell tables and `images` drawings, then the section properties. */
export function buildDocx(
  opts: {
    paragraphs?: { text: string; style?: string }[];
    styles?: FixtureStyle[];
    defaults?: { font?: string; sizePt?: number };
    theme?: FixtureTheme;
    page?: { widthIn: number; heightIn: number; orientation?: "portrait" | "landscape" };
    tables?: number;
    images?: number;
  } = {},
): Uint8Array {
  const paragraphs = opts.paragraphs ?? [
    { text: "Monthly board update", style: "Title" },
    { text: "Summary", style: "Heading1" },
    { text: "Revenue grew 12% against plan." },
  ];
  const defaults = { font: "Calibri", sizePt: 11, ...opts.defaults };
  const page = opts.page ?? { widthIn: 8.5, heightIn: 11 };
  const body = [
    ...paragraphs.map((p) => `<w:p>${p.style ? `<w:pPr><w:pStyle w:val="${esc(p.style)}"/></w:pPr>` : ""}${wRun(p.text)}</w:p>`),
    ...Array.from({ length: opts.tables ?? 0 }, () => `<w:tbl><w:tblPr/><w:tr><w:tc><w:p>${wRun("Cell")}</w:p></w:tc></w:tr></w:tbl>`),
    ...Array.from({ length: opts.images ?? 0 }, (_, i) => `<w:p><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:docPr id="${i + 1}" name="Picture"/></wp:inline></w:drawing></w:r></w:p>`),
  ].join("");
  const orient = page.orientation === "landscape" ? ' w:orient="landscape"' : "";
  const W = "application/vnd.openxmlformats-officedocument.wordprocessingml";
  return zip({
    "[Content_Types].xml": contentTypes([
      ["word/document.xml", `${W}.document.main+xml`],
      ["word/styles.xml", `${W}.styles+xml`],
      ["word/theme/theme1.xml", "application/vnd.openxmlformats-officedocument.theme+xml"],
    ]),
    "_rels/.rels": rels([{ id: "rId1", type: "officeDocument", target: "word/document.xml" }]),
    "word/_rels/document.xml.rels": rels([
      { id: "rId1", type: "styles", target: "styles.xml" },
      { id: "rId2", type: "theme", target: "theme/theme1.xml" },
    ]),
    "word/document.xml": `${XML}<w:document xmlns:w="${NS.w}" xmlns:r="${NS.r}"><w:body>${body}<w:sectPr><w:pgSz w:w="${Math.round(page.widthIn * 1440)}" w:h="${Math.round(
      page.heightIn * 1440,
    )}"${orient}/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`,
    "word/styles.xml": `${XML}<w:styles xmlns:w="${NS.w}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${esc(defaults.font)}" w:hAnsi="${esc(
      defaults.font,
    )}"/><w:sz w:val="${defaults.sizePt * 2}"/></w:rPr></w:rPrDefault></w:docDefaults>${(opts.styles ?? DEFAULT_DOCX_STYLES).map(styleXml).join("")}</w:styles>`,
    "word/theme/theme1.xml": themeXml(opts.theme),
  });
}

const column = (index: number) => {
  let n = index + 1;
  let name = "";
  while (n > 0) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
};

/**
 * A real Excel package. Strings go to the shared-string table unless the sheet sets `inlineStrings`.
 * `reverseFiles` stores sheet i as sheet(n - i).xml, so tests can prove the extractor follows workbook rels.
 */
export function buildXlsx(
  opts: {
    sheets?: { name: string; rows: FixtureCell[][]; inlineStrings?: boolean }[];
    numFmts?: string[];
    definedNames?: string[];
    charts?: number;
    theme?: FixtureTheme;
    reverseFiles?: boolean;
  } = {},
): Uint8Array {
  const sheets = opts.sheets ?? [
    {
      name: "Revenue",
      rows: [
        ["Month", "Plan", "Actual", "Variance"],
        ["Jan", 100, 112, { formula: "C2-B2", value: 12 }],
      ],
    },
  ];
  const shared: string[] = [];
  const sharedIndex = (text: string) => {
    const at = shared.indexOf(text);
    if (at !== -1) return at;
    shared.push(text);
    return shared.length - 1;
  };
  const S = "application/vnd.openxmlformats-officedocument.spreadsheetml";
  const entries: Record<string, string> = {};
  const fileOf = (i: number) => (opts.reverseFiles ? sheets.length - i : i + 1);
  sheets.forEach((sheet, i) => {
    const rowsXml = sheet.rows
      .map((cells, r) => {
        const cellsXml = cells
          .map((cell, c) => {
            const ref = `${column(c)}${r + 1}`;
            if (typeof cell === "number") return `<c r="${ref}"><v>${cell}</v></c>`;
            if (typeof cell === "object") return `<c r="${ref}"><f>${esc(cell.formula)}</f><v>${cell.value ?? 0}</v></c>`;
            if (sheet.inlineStrings) return `<c r="${ref}" t="inlineStr"><is><t>${esc(cell)}</t></is></c>`;
            return `<c r="${ref}" t="s"><v>${sharedIndex(cell)}</v></c>`;
          })
          .join("");
        return `<row r="${r + 1}">${cellsXml}</row>`;
      })
      .join("");
    const width = Math.max(1, ...sheet.rows.map((row) => row.length));
    entries[`xl/worksheets/sheet${fileOf(i)}.xml`] = `${XML}<worksheet xmlns="${NS.s}" xmlns:r="${NS.r}"><dimension ref="A1:${column(width - 1)}${Math.max(1, sheet.rows.length)}"/><sheetData>${rowsXml}</sheetData></worksheet>`;
  });
  const numFmts = opts.numFmts ?? ['"$"#,##0'];
  entries["xl/styles.xml"] = `${XML}<styleSheet xmlns="${NS.s}"><numFmts count="${numFmts.length}">${numFmts
    .map((code, i) => `<numFmt numFmtId="${164 + i}" formatCode="${esc(code)}"/>`)
    .join("")}</numFmts><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellXfs></styleSheet>`;
  entries["xl/sharedStrings.xml"] = `${XML}<sst xmlns="${NS.s}" count="${shared.length}" uniqueCount="${shared.length}">${shared.map((t) => `<si><t>${esc(t)}</t></si>`).join("")}</sst>`;
  entries["xl/theme/theme1.xml"] = themeXml(opts.theme);
  for (let i = 1; i <= (opts.charts ?? 0); i += 1) entries[`xl/charts/chart${i}.xml`] = `${XML}<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"/>`;
  const definedNames = opts.definedNames ?? [];
  entries["xl/workbook.xml"] = `${XML}<workbook xmlns="${NS.s}" xmlns:r="${NS.r}"><sheets>${sheets
    .map((sheet, i) => `<sheet name="${esc(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join("")}</sheets>${definedNames.length ? `<definedNames>${definedNames.map((n) => `<definedName name="${esc(n)}">Sheet1!$A$1</definedName>`).join("")}</definedNames>` : ""}</workbook>`;
  entries["xl/_rels/workbook.xml.rels"] = rels([
    ...sheets.map((_, i) => ({ id: `rId${i + 1}`, type: "worksheet", target: `worksheets/sheet${fileOf(i)}.xml` })),
    { id: "rIdS", type: "styles", target: "styles.xml" },
    { id: "rIdSS", type: "sharedStrings", target: "sharedStrings.xml" },
    { id: "rIdT", type: "theme", target: "theme/theme1.xml" },
  ]);
  entries["_rels/.rels"] = rels([{ id: "rId1", type: "officeDocument", target: "xl/workbook.xml" }]);
  entries["[Content_Types].xml"] = contentTypes([
    ["xl/workbook.xml", `${S}.sheet.main+xml`],
    ...sheets.map((_, i): [string, string] => [`xl/worksheets/sheet${fileOf(i)}.xml`, `${S}.worksheet+xml`]),
  ]);
  return zip(entries);
}

/** A valid minimal PDF (catalog, page tree, pages, info, xref, trailer) written as text. */
export function tinyPdf(opts: { pages?: number; title?: string; encrypted?: boolean } = {}): Uint8Array {
  const pages = opts.pages ?? 1;
  const objects: string[] = [];
  const pageIds = Array.from({ length: pages }, (_, i) => i + 4);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages} >>`;
  objects[3] = opts.title === undefined ? "<< /Producer (LMS tests) >>" : `<< /Title (${opts.title.replace(/([\\()])/g, "\\$1")}) /Producer (LMS tests) >>`;
  for (const id of pageIds) objects[id] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>";
  const encryptId = pages + 4;
  if (opts.encrypted) objects[encryptId] = "<< /Filter /Standard /V 1 /R 2 /O (x) /U (x) /P -4 >>";
  let out = "%PDF-1.7\n%\xE2\xE3\xCF\xD3\n";
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = out.length;
    out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R /Info 3 0 R${opts.encrypted ? ` /Encrypt ${encryptId} 0 R` : ""} >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, "latin1"));
}

const solid = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: { r: 31, g: 78, b: 121 } } });
export async function tinyPng(width = 4, height = 3): Promise<Uint8Array> {
  return new Uint8Array(await solid(width, height).png().toBuffer());
}
export async function tinyJpeg(width = 4, height = 3): Promise<Uint8Array> {
  return new Uint8Array(await solid(width, height).jpeg().toBuffer());
}

/** The OLE compound-file signature: encrypted Office files and .ppt/.doc/.xls start with it. */
export function oleHeader(): Uint8Array {
  const bytes = new Uint8Array(512);
  bytes.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  return bytes;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
