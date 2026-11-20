// Single source of truth for the workshop price. One flat amount for
// every participant regardless of which package they select — the
// previous per-package pricing tiers (Day 1 / Day 2 / Both days) were
// removed per an explicit change request. ₹28,250 already includes
// 18% GST on the approved ₹23,940 base fee.
export const WORKSHOP_PRICE_INR = 28250;

export type WorkshopPackageKey = "DAY1" | "DAY2" | "BOTH";

export function getPackageAmountInr(): number {
  return WORKSHOP_PRICE_INR;
}
