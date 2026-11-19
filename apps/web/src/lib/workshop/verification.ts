import crypto from "crypto";
import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth";
import { consoleNotificationService, type NotificationService } from "./notifications";
import type { WorkshopRegistration } from "@prisma/client";

export class VerificationError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) {
    super(message);
    this.name = "VerificationError";
  }
}

const GROUP_NAME_BY_PACKAGE: Record<string, string[]> = {
  DAY1: ["XI Workshop · Day 1"],
  DAY2: ["XI Workshop · Day 2"],
  BOTH: ["XI Workshop · Day 1", "XI Workshop · Day 2"],
};

async function requireProofSubmitted(registrationId: string) {
  const registration = await prisma.workshopRegistration.findUnique({
    where: { id: registrationId },
  });
  if (!registration) {
    throw new VerificationError("Registration not found", "NOT_FOUND", 404);
  }
  if (
    registration.status !== "PROOF_SUBMITTED" &&
    registration.status !== "UNDER_VERIFICATION"
  ) {
    throw new VerificationError(
      "This registration has no payment proof awaiting review",
      "NO_PROOF_SUBMITTED",
      409
    );
  }
  return registration;
}

export async function approveRegistration(
  adminId: string,
  registrationId: string,
  note?: string,
  notifications: NotificationService = consoleNotificationService
): Promise<WorkshopRegistration> {
  const registration = await requireProofSubmitted(registrationId);

  const updated = await prisma.$transaction(async (tx) => {
    let user = await tx.user.findFirst({ where: { email: registration.email } });
    if (!user) {
      user = await tx.user.create({
        data: {
          name: registration.fullName,
          email: registration.email,
          password: await hashPassword(crypto.randomBytes(24).toString("hex")),
          role: "MENTEE",
          emailVerified: true,
        },
      });
    }

    const groupNames = GROUP_NAME_BY_PACKAGE[registration.workshopPackage] ?? [];
    const groups = await tx.group.findMany({ where: { name: { in: groupNames } } });
    for (const group of groups) {
      try {
        await tx.groupMember.create({
          data: { userId: user.id, groupId: group.id, role: "MENTEE" },
        });
      } catch (error: unknown) {
        const isDuplicate =
          typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
        if (!isDuplicate) throw error;
      }
    }

    const result = await tx.workshopRegistration.update({
      where: { id: registration.id },
      data: { status: "APPROVED", onboardedUserId: user.id },
    });

    await tx.paymentVerificationLog.create({
      data: { registrationId: registration.id, action: "APPROVED", note, adminId },
    });

    return result;
  });

  await notifications.sendApproval(updated);
  return updated;
}

export async function rejectRegistration(
  adminId: string,
  registrationId: string,
  note: string,
  notifications: NotificationService = consoleNotificationService
): Promise<WorkshopRegistration> {
  const registration = await requireProofSubmitted(registrationId);

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.workshopRegistration.update({
      where: { id: registration.id },
      data: { status: "REJECTED" },
    });
    await tx.paymentVerificationLog.create({
      data: { registrationId: registration.id, action: "REJECTED", note, adminId },
    });
    return result;
  });

  await notifications.sendRejection(updated, note);
  return updated;
}

export async function requestResubmission(
  adminId: string,
  registrationId: string,
  note: string
): Promise<WorkshopRegistration> {
  const registration = await requireProofSubmitted(registrationId);

  return prisma.$transaction(async (tx) => {
    const result = await tx.workshopRegistration.update({
      where: { id: registration.id },
      data: { status: "RESUBMISSION_REQUESTED" },
    });
    await tx.paymentVerificationLog.create({
      data: {
        registrationId: registration.id,
        action: "RESUBMISSION_REQUESTED",
        note,
        adminId,
      },
    });
    return result;
  });
}
