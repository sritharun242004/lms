import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getPackageAmountInr } from "./pricing";
import type { WorkshopRegistration } from "@prisma/client";

export class RegistrationError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) {
    super(message);
    this.name = "RegistrationError";
  }
}

export const registrationInputSchema = z
  .object({
    registrationKind: z.enum(["INDIVIDUAL", "COMPANY"]).default("INDIVIDUAL"),
    fullName: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().email(),
    whatsappNumber: z.string().trim().min(8).max(20),
    // Free-text organisation name — optional, individual registrations
    // only. Company registrations carry their identity in
    // companyName/companyAddress/companyGstin instead.
    company: z.string().trim().max(160).optional(),
    designation: z.string().trim().min(1).max(120),
    workshopPackage: z.enum(["DAY1", "DAY2", "BOTH"]),
    previousDay1Attendance: z.boolean().optional(),
    previousDay1When: z.string().trim().max(200).optional(),
    aiExperienceLevel: z.enum(["NEW", "SOMETIMES", "DAILY"]),
    aiUseCase: z.string().trim().max(500).optional(),
    subscriptions: z.array(z.string()).default([]),
    needsGstInvoice: z.boolean().default(false),
    gstCompanyName: z.string().trim().max(200).optional(),
    gstin: z.string().trim().max(20).optional(),
    companyName: z.string().trim().max(200).optional(),
    companyAddress: z.string().trim().max(500).optional(),
    companyGstin: z.string().trim().max(20).optional(),
    referredBy: z.string().trim().max(160).optional(),
    ageConfirmed: z.literal(true),
  })
  .superRefine((value, ctx) => {
    if (value.workshopPackage === "DAY2") {
      if (!value.previousDay1Attendance) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["previousDay1Attendance"],
          message: "Day 2 requires prior Day 1 attendance — choose Both days instead",
        });
      } else if (!value.previousDay1When) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["previousDay1When"],
          message: "Say when you completed Day 1",
        });
      }
    }
    if (value.registrationKind === "COMPANY") {
      if (!value.companyName) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["companyName"], message: "Company name is required" });
      }
      if (!value.companyAddress) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["companyAddress"], message: "Company address is required" });
      }
      if (!value.companyGstin) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["companyGstin"], message: "Company GSTIN is required" });
      }
    }
  });

export type RegistrationInput = z.infer<typeof registrationInputSchema>;

export function generateRegistrationCode(year: number, sequence: number): string {
  return `XI-${year}-${String(sequence).padStart(4, "0")}`;
}

async function nextSequenceForYear(year: number): Promise<number> {
  const count = await prisma.workshopRegistration.count({
    where: { registrationCode: { startsWith: `XI-${year}-` } },
  });
  return count + 1;
}

export async function createRegistration(
  input: RegistrationInput
): Promise<WorkshopRegistration> {
  const parsed = registrationInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new RegistrationError(
      parsed.error.issues[0]?.message ?? "Invalid registration",
      "VALIDATION_ERROR",
      400
    );
  }
  const data = parsed.data;
  const amountInInr = getPackageAmountInr();
  const year = new Date().getFullYear();

  // Retry once on the unique-code race: two submissions in the same
  // millisecond could compute the same sequence number from `count()`.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const sequence = await nextSequenceForYear(year);
    try {
      return await prisma.workshopRegistration.create({
        data: {
          registrationCode: generateRegistrationCode(year, sequence),
          registrationKind: data.registrationKind,
          fullName: data.fullName,
          email: data.email,
          whatsappNumber: data.whatsappNumber,
          company: data.company,
          designation: data.designation,
          workshopPackage: data.workshopPackage,
          previousDay1Attendance: data.previousDay1Attendance,
          previousDay1When: data.previousDay1When,
          aiExperienceLevel: data.aiExperienceLevel,
          aiUseCase: data.aiUseCase,
          subscriptions: data.subscriptions,
          needsGstInvoice: data.needsGstInvoice,
          gstCompanyName: data.gstCompanyName,
          gstin: data.gstin,
          companyName: data.companyName,
          companyAddress: data.companyAddress,
          companyGstin: data.companyGstin,
          referredBy: data.referredBy,
          ageConfirmed: data.ageConfirmed,
          amountInInr,
          status: "PENDING_PAYMENT",
        },
      });
    } catch (error) {
      const isUniqueClash =
        typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
      if (!isUniqueClash || attempt === 1) throw error;
    }
  }
  throw new RegistrationError("Could not allocate a registration code", "CODE_CLASH", 500);
}

export async function findRegistrationByCode(
  registrationCode: string
): Promise<WorkshopRegistration | null> {
  return prisma.workshopRegistration.findUnique({ where: { registrationCode } });
}
