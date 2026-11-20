import { describe, expect, it } from "vitest";
import { getPackageAmountInr, WORKSHOP_PRICE_INR } from "./pricing";

describe("getPackageAmountInr", () => {
  it("returns the flat workshop price", () => {
    expect(getPackageAmountInr()).toBe(28250);
  });

  it("exposes the price via the exported constant", () => {
    expect(WORKSHOP_PRICE_INR).toBe(28250);
  });
});
