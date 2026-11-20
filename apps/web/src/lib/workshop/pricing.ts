// Single source of truth for workshop package pricing, all figures incl.
// 18% GST. No discounts applied anywhere beyond the Day1+Day2 bundle's
// own USD 36 saving vs booking the two days separately.
export const WORKSHOP_PACKAGE_PRICING_INR = {
  DAY1: 28250,
  DAY2: 31275,
  BOTH: 55490,
} as const satisfies Record<"DAY1" | "DAY2" | "BOTH", number>;

export const WORKSHOP_PACKAGE_PRICING_USD = {
  DAY1: 252,
  DAY2: 279,
  BOTH: 495,
} as const satisfies Record<"DAY1" | "DAY2" | "BOTH", number>;

export type WorkshopPackageKey = keyof typeof WORKSHOP_PACKAGE_PRICING_INR;

export function getPackageAmountInr(pkg: WorkshopPackageKey): number {
  return WORKSHOP_PACKAGE_PRICING_INR[pkg];
}
