import { describe, expect, it } from "vitest";
import { registrationInputSchema, generateRegistrationCode } from "./registration";

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
