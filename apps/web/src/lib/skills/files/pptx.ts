import { JOB_LIMITS } from "../limits";
import { EMU_PER_INCH, partNumber, readTheme, relsPathFor, relTargets, topColors, type OoxmlPackage } from "./ooxml";
import type { PptxFacts, SlideFacts } from "./types";
import { attr, collapse, elements, first, textOf } from "./xml";

const round2 = (value: number) => Math.round(value * 100) / 100;
const byNumber = (a: string, b: string) => partNumber(a) - partNumber(b);

/** PowerPoint's presets; "A4" is its "A4 Paper" slide (10.83 x 7.5 in), not the ISO page ratio. */
type Aspect = NonNullable<PptxFacts["slideSize"]>["aspect"];
const ASPECTS: [Aspect, number][] = [
  ["16:9", 16 / 9],
  ["4:3", 4 / 3],
  ["16:10", 16 / 10],
  ["A4", 10.83 / 7.5],
];

function aspectOf(cx: number, cy: number): Aspect {
  const ratio = Math.max(cx, cy) / Math.min(cx, cy);
  return ASPECTS.find(([, target]) => Math.abs(ratio / target - 1) <= 0.02)?.[0] ?? "custom";
}

const cSldName = (xml: string | undefined) => {
  const name = attr(xml ? first(xml, "cSld") : null, "name");
  return name ? collapse(name, 100) : null;
};

function slideFacts(xml: string, index: number, layout: string | null): SlideFacts {
  let title: string | null = null;
  const placeholders: string[] = [];
  for (const shape of elements(xml, "sp")) {
    const ph = first(shape.inner, "ph");
    if (!ph) continue;
    const type = attr(ph, "type") ?? "body";
    if (!placeholders.includes(type)) placeholders.push(type);
    if (title === null && (type === "title" || type === "ctrTitle")) title = collapse(textOf(shape.inner), 200) || null;
  }
  return {
    index,
    layout,
    title,
    placeholders,
    text: collapse(textOf(xml), 300),
    tables: elements(xml, "tbl").length,
    charts: elements(xml, "graphicData").filter((g) => (attr(g, "uri") ?? "").endsWith("/chart")).length,
    images: elements(xml, "pic").length,
  };
}

/** Facts from a PowerPoint package (spec, stage 2, PPTX). Missing parts give empty facts, never an exception. */
export function extractPptx(pkg: OoxmlPackage): PptxFacts {
  const part = (name: string | undefined) => (name ? pkg.parts.get(name) : undefined);
  let truncated = pkg.truncated;
  const presentation = part("ppt/presentation.xml") ?? "";

  const size = first(presentation, "sldSz");
  const cx = Number(attr(size, "cx"));
  const cy = Number(attr(size, "cy"));
  const slideSize = cx > 0 && cy > 0 ? { widthIn: round2(cx / EMU_PER_INCH), heightIn: round2(cy / EMU_PER_INCH), aspect: aspectOf(cx, cy) } : null;

  const themeParts = pkg.names.filter((n) => /^ppt\/theme\/theme\d+\.xml$/.test(n)).sort(byNumber);
  const themes = themeParts.flatMap((n) => {
    const name = attr(first(part(n) ?? "", "theme"), "name");
    return name ? [collapse(name, 100)] : [];
  });

  const masters = pkg.names
    .filter((n) => /^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(n))
    .sort(byNumber)
    .map((n) => cSldName(part(n)) ?? `Master ${partNumber(n)}`);
  const layoutNames = new Map<string, string>();
  for (const n of pkg.names.filter((name) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(name)).sort(byNumber)) {
    layoutNames.set(n, cSldName(part(n)) ?? `Layout ${partNumber(n)}`);
  }

  const presentationRels = relTargets(part("ppt/_rels/presentation.xml.rels"), "ppt/presentation.xml");
  const listed = elements(first(presentation, "sldIdLst")?.inner ?? "", "sldId");
  const fromList = listed.flatMap((el) => {
    const target = presentationRels.get(attr(el, "r:id") ?? "");
    return target ? [target] : [];
  });
  const slideParts = fromList.length > 0 ? fromList : pkg.names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort(byNumber);
  const slideCount = listed.length || slideParts.length;

  const parsed = slideParts.slice(0, JOB_LIMITS.ooxmlPartsParsed);
  if (slideParts.length > parsed.length || parsed.length > JOB_LIMITS.slidesDetailed) truncated = true;
  const xmls: string[] = [];
  const slides: SlideFacts[] = [];
  parsed.forEach((slidePart, i) => {
    const xml = part(slidePart);
    if (xml === undefined) {
      truncated = true;
      return;
    }
    xmls.push(xml);
    if (i >= JOB_LIMITS.slidesDetailed) return;
    const layoutPart = [...relTargets(part(relsPathFor(slidePart)), slidePart).values()].find((t) => /slideLayouts\/slideLayout\d+\.xml$/.test(t));
    slides.push(slideFacts(xml, i + 1, layoutPart ? (layoutNames.get(layoutPart) ?? null) : null));
  });

  const fontsUsed: string[] = [];
  for (const xml of xmls) {
    for (const latin of elements(xml, "latin")) {
      const face = attr(latin, "typeface");
      if (!face || face.startsWith("+") || fontsUsed.includes(face) || fontsUsed.length >= 12) continue;
      fontsUsed.push(collapse(face, 100));
    }
  }

  return {
    kind: "PPTX",
    slideSize,
    theme: readTheme(part(themeParts[0])),
    themes,
    masters,
    layouts: [...layoutNames.values()],
    slideCount,
    slides,
    colorsUsed: topColors(xmls, 12),
    fontsUsed,
    truncated,
  };
}
