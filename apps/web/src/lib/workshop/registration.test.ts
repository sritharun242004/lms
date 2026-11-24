import { describe, expect, it } from "vitest";
import { registrationInputSchema, generateRegistrationCode, nextSequenceFromCodes } from "./registration";

describe("registrationInputSchema", () => {
  const base = {
    fullName: "Asha Rao",
    email: "asha@example.com",
    whatsappNumber: "+919876543210",
    company: "Acme Co",
    designation: "Founder",
    workshopPackage: "BOTH" as const,
    aiExperienceLevel: "SOMETIMES" as const,
    subscriptions: ["Claude Pro"],
    needsGstInvoice: false,
    ageConfirmed: true,
  };

  it("accepts a valid Both-days registration", () => {
    expect(registrationInputSchema.safeParse(base).success).toBe(true);
  });

  it("rejects when age is not confirmed", () => {
    const result = registrationInputSchema.safeParse({ ...base, ageConfirmed: false });
    expect(result.success).toBe(false);
  });

  it("accepts Day2-only with attendance but no when value", () => {
    const result = registrationInputSchema.safeParse({
      ...base,
      workshopPackage: "DAY2",
      previousDay1Attendance: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts Day2-only with attendance and a when value", () => {
    const result = registrationInputSchema.safeParse({
      ...base,
      workshopPackage: "DAY2",
      previousDay1Attendance: true,
      previousDay1When: "March cohort",
    });
    expect(result.success).toBe(true);
  });

  it("accepts Day2-only when the participant has not done Day 1 (warned, not blocked)", () => {
    const result = registrationInputSchema.safeParse({
      ...base,
      workshopPackage: "DAY2",
      previousDay1Attendance: false,
    });
    expect(result.success).toBe(true);
  });

  it("accepts Day2-only when the Day 1 question is left unanswered", () => {
    const result = registrationInputSchema.safeParse({ ...base, workshopPackage: "DAY2" });
    expect(result.success).toBe(true);
  });

  it("defaults registrationKind to INDIVIDUAL and allows no company name", () => {
    const result = registrationInputSchema.safeParse({ ...base, company: undefined });
    expect(result.success).toBe(true);
    expect(result.success && result.data.registrationKind).toBe("INDIVIDUAL");
  });

  it("requires company name, address, and GSTIN for a COMPANY registration", () => {
    const result = registrationInputSchema.safeParse({ ...base, registrationKind: "COMPANY" });
    expect(result.success).toBe(false);
  });

  it("accepts a COMPANY registration with company details supplied", () => {
    const result = registrationInputSchema.safeParse({
      ...base,
      registrationKind: "COMPANY",
      companyName: "Acme Co",
      companyAddress: "123 Main St, Chennai",
      companyGstin: "33AAACA1234A1Z5",
    });
    expect(result.success).toBe(true);
  });
});

describe("generateRegistrationCode", () => {
  it("produces an XI-prefixed code with a 4+ digit sequence", () => {
    expect(generateRegistrationCode(2026, 7)).toBe("XI-2026-0007");
  });
});

describe("nextSequenceFromCodes", () => {
  it("starts at 1 when the year has no registrations", () => {
    expect(nextSequenceFromCodes(2026, [])).toBe(1);
  });

  it("continues after the highest code even when earlier rows were deleted", () => {
    // 12 rows left after deletions, highest code 0018: a row count would
    // hand out 0013, which is still taken.
    const codes = ["0007", "0008", "0009", "0010", "0011", "0012", "0013", "0014", "0015", "0016", "0017", "0018"].map(
      (n) => `XI-2026-${n}`
    );
    expect(nextSequenceFromCodes(2026, codes)).toBe(19);
  });

  it("ignores other years and malformed codes", () => {
    expect(nextSequenceFromCodes(2026, ["XI-2025-0040", "XI-2026-0003", "XI-2026-abc"])).toBe(4);
  });

  it("orders numerically past four digits", () => {
    expect(nextSequenceFromCodes(2026, ["XI-2026-9999", "XI-2026-10000"])).toBe(10001);
  });
});
