import { strFromU8, unzipSync, type Unzipped } from "fflate";
import { JOB_LIMITS } from "../limits";
import { FILE_READ_MESSAGES, FileReadError, THEME_SLOTS, type ColorUse, type ThemeFacts } from "./types";
import { attr, collapse, elements, first, type XmlElement } from "./xml";

export const EMU_PER_INCH = 914_400;

export type OoxmlPackage = { names: string[]; parts: Map<string, string>; truncated: boolean };

const wantedPart = (name: string) => /\.(xml|rels)$/i.test(name) && !name.startsWith("customXml/");

/**
 * Opens an OOXML package without inflating anything it doesn't need: only XML and rels parts are read, each at most
 * ooxmlPartBytes (declared size) and ooxmlTotalBytes together; anything over is skipped and marks the package truncated.
 * Media, embedded files and binary parts are never inflated. Every entry name is listed, read or not.
 */
export function openOoxml(bytes: Uint8Array): OoxmlPackage {
  const names: string[] = [];
  let total = 0;
  let truncated = false;
  let files: Unzipped;
  try {
    files = unzipSync(bytes, {
      filter: (file) => {
        names.push(file.name);
        if (!wantedPart(file.name)) return false;
        if (file.compression !== 0 && file.compression !== 8) return false;
        if (file.originalSize > JOB_LIMITS.ooxmlPartBytes || total + file.originalSize > JOB_LIMITS.ooxmlTotalBytes) {
          truncated = true;
          return false;
        }
        total += file.originalSize;
        return true;
      },
    });
  } catch {
    throw new FileReadError("FILE_UNREADABLE", FILE_READ_MESSAGES.unreadable);
  }
  const parts = new Map<string, string>();
  for (const [name, data] of Object.entries(files)) parts.set(name, strFromU8(data).replace(/^﻿/, ""));
  return { names, parts, truncated };
}

function resolvePart(fromPart: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const segments = fromPart.split("/").slice(0, -1);
  for (const segment of target.split("/")) {
    if (segment === "..") segments.pop();
    else if (segment && segment !== ".") segments.push(segment);
  }
  return segments.join("/");
}

export function relTargets(relsXml: string | undefined, fromPart: string): Map<string, string> {
  const targets = new Map<string, string>();
  if (!relsXml) return targets;
  for (const rel of elements(relsXml, "Relationship")) {
    const id = attr(rel, "Id");
    const target = attr(rel, "Target");
    if (!id || !target || attr(rel, "TargetMode") === "External") continue;
    targets.set(id, resolvePart(fromPart, target));
  }
  return targets;
}

export function relsPathFor(part: string): string {
  const slash = part.lastIndexOf("/");
  return `${part.slice(0, slash + 1)}_rels/${part.slice(slash + 1)}.rels`;
}

export function partNumber(name: string): number {
  const match = /(\d+)\.xml$/.exec(name);
  return match ? Number(match[1]) : 0;
}

export function toHex(value: string | null): string | null {
  return value && /^[0-9a-fA-F]{6}$/.test(value) ? `#${value.toUpperCase()}` : null;
}

export function colorOf(el: XmlElement | null): string | null {
  if (!el) return null;
  const rgb = first(el.inner, "srgbClr");
  if (rgb) return toHex(attr(rgb, "val"));
  const sys = first(el.inner, "sysClr");
  return sys ? toHex(attr(sys, "lastClr")) : null;
}

const typeface = (xml: string | undefined, fontKind: "majorFont" | "minorFont") => {
  const font = xml ? first(xml, fontKind) : null;
  const face = attr(font ? first(font.inner, "latin") : null, "typeface");
  return face ? collapse(face, 100) : null;
};

export function readTheme(xml: string | undefined): ThemeFacts | null {
  if (!xml) return null;
  const theme = first(xml, "theme");
  const scheme = first(xml, "clrScheme");
  const colors = scheme
    ? THEME_SLOTS.flatMap((slot) => {
        const hex = colorOf(first(scheme.inner, slot));
        return hex ? [{ slot, hex }] : [];
      })
    : [];
  const name = attr(theme, "name");
  return { name: name ? collapse(name, 100) : null, colors, majorFont: typeface(xml, "majorFont"), minorFont: typeface(xml, "minorFont") };
}

export function topColors(xmls: string[], limit = 12): ColorUse[] {
  const counts = new Map<string, number>();
  for (const xml of xmls) {
    for (const el of elements(xml, "srgbClr")) {
      const hex = toHex(attr(el, "val"));
      if (hex) counts.set(hex, (counts.get(hex) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([hex, count]) => ({ hex, count }))
    .sort((a, b) => b.count - a.count || a.hex.localeCompare(b.hex))
    .slice(0, limit);
}
