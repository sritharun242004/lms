import { describe, expect, it } from "vitest";
import { getPackageAmountInr, WORKSHOP_PACKAGE_PRICING_INR } from "./pricing";

describe("getPackageAmountInr", () => {
  it("returns the configured amount for each package", () => {
    expect(getPackageAmountInr("DAY1")).toBe(28250);
    expect(getPackageAmountInr("DAY2")).toBe(31275);
    expect(getPackageAmountInr("BOTH")).toBe(55490);
  });

  it("exposes the same values via the exported config map", () => {
    expect(WORKSHOP_PACKAGE_PRICING_INR.DAY1).toBe(28250);
  });
});
