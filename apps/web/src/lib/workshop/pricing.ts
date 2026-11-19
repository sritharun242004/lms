// Single source of truth for workshop package pricing, all figures incl.
// 18% GST per the approved brief. Day 2's base fee (₹26,505) times 1.18
// is ₹31,275.90 — the brief flags this rounding as unconfirmed, so it is
// kept here as a plain config value rather than computed, making the
// eventual business decision a one-line change.
export const WORKSHOP_PACKAGE_PRICING_INR = {
  DAY1: 28250,
  DAY2: 31275,
  BOTH: 55490,
} as const satisfies Record<"DAY1" | "DAY2" | "BOTH", number>;

export type WorkshopPackageKey = keyof typeof WORKSHOP_PACKAGE_PRICING_INR;

export function getPackageAmountInr(pkg: WorkshopPackageKey): number {
  return WORKSHOP_PACKAGE_PRICING_INR[pkg];
}
