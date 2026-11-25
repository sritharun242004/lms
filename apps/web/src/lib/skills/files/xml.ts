/**
 * A small, tolerant scanner for the OOXML parts the extractors read. It never expands entities beyond the five
 * predefined ones and numeric references, never reads a DTD, and matches tags by local name whatever their prefix.
 * Same-name nesting is not supported (OOXML parts the extractors read do not nest the elements they look for).
 */
export type XmlElement = { name: string; attrs: Record<string, string>; inner: string };

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (match, entity: string) => {
    if (entity[0] !== "#") return NAMED[entity];
    const code = entity[1] === "x" ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
  });
}

const ATTRIBUTE = /([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of raw.matchAll(ATTRIBUTE)) attrs[m[1]] = decodeXml(m[2] ?? m[3] ?? "");
  return attrs;
}

/** Upper bound on elements returned per call: far above any part the extractors read, so a hostile part can't flood them. */
export const MAX_ELEMENTS = 50_000;

export function elements(xml: string, localName: string): XmlElement[] {
  const open = new RegExp(`<((?:[A-Za-z_][\\w.-]*:)?${escapeRegExp(localName)})(?=[\\s/>])([^>]*?)(/?)>`, "g");
  const found: XmlElement[] = [];
  // Once a close tag is missing from the rest of the part it is missing for every later element of that name,
  // so searching again would rescan the part per element (quadratic): remember it and treat the rest as unclosed.
  const exhausted = new Set<string>();
  for (let m = open.exec(xml); m && found.length < MAX_ELEMENTS; m = open.exec(xml)) {
    const [, name, rawAttrs, selfClosing] = m;
    const attrs = parseAttrs(rawAttrs);
    if (selfClosing || exhausted.has(name)) {
      found.push({ name, attrs, inner: "" });
      continue;
    }
    const close = `</${name}>`;
    const end = xml.indexOf(close, open.lastIndex);
    if (end === -1) {
      exhausted.add(name);
      found.push({ name, attrs, inner: "" });
      continue;
    }
    found.push({ name, attrs, inner: xml.slice(open.lastIndex, end) });
    open.lastIndex = end + close.length;
  }
  return found;
}

export function first(xml: string, localName: string): XmlElement | null {
  return elements(xml, localName)[0] ?? null;
}

/** Exact attribute name first ("r:id"), then any prefix (local "val" matches "w:val"). */
export function attr(el: XmlElement | null | undefined, localName: string): string | null {
  if (!el) return null;
  if (localName in el.attrs) return el.attrs[localName];
  const suffix = `:${localName}`;
  for (const [key, value] of Object.entries(el.attrs)) if (key.endsWith(suffix)) return value;
  return null;
}

export function textOf(xml: string, localName = "t"): string {
  return elements(xml, localName)
    .map((el) => decodeXml(el.inner.replace(/<[^>]*>/g, "")))
    .join("");
}

export const collapse = (text: string, max = Number.POSITIVE_INFINITY): string => text.replace(/\s+/g, " ").trim().slice(0, max);
