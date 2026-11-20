export const PALETTES = [
  { key: "xi-blue", label: "XI Blue" },
  { key: "slate", label: "Slate" },
  { key: "emerald", label: "Emerald" },
  { key: "violet", label: "Violet" },
] as const;

export type PaletteKey = (typeof PALETTES)[number]["key"];

export function isPaletteKey(value: string | null | undefined): value is PaletteKey {
  return PALETTES.some((p) => p.key === value);
}

export const DEFAULT_PALETTE: PaletteKey = "xi-blue";
