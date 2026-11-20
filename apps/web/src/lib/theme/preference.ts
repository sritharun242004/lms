import { prisma } from "@/lib/db/prisma";
import { isPaletteKey, type PaletteKey } from "./palettes";

export class ThemePreferenceError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) {
    super(message);
    this.name = "ThemePreferenceError";
  }
}

export async function updateThemePreference(userId: string, palette: string): Promise<PaletteKey> {
  if (!isPaletteKey(palette)) {
    throw new ThemePreferenceError("Unknown palette", "INVALID_PALETTE", 400);
  }
  await prisma.user.update({ where: { id: userId }, data: { themePreference: palette } });
  return palette;
}
