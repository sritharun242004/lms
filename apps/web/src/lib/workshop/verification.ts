import { prisma } from "@/lib/db/prisma";
import { consoleNotificationService, type NotificationService } from "./notifications";
import { isValidWhatsAppInviteUrl } from "./whatsapp";
import type { WorkshopRegistration } from "@prisma/client";

export class VerificationError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) {
    super(message);
    this.name = "VerificationError";
  }
}

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

export type ApproveRegistrationInput = {
  note?: string;
  // The group link an admin pastes in during approval. Optional only
  // when the registration already has one saved from a prior approval
  // attempt, or when `allowMissingWhatsappLink` is explicitly set — the
  // workshop's own explicit exception path, never a silent default.
  whatsappGroupInviteUrl?: string;
  allowMissingWhatsappLink?: boolean;
};

// This workshop site owns its own registration/payment data end to end.
// Approval never touches the CMS's User or GroupMember tables — no
// account is created, no group membership is assigned. The only
// "membership" a participant gets is the WhatsApp group link saved here
// and handed back to them on their payment status page.
export async function approveRegistration(
  adminId: string,
  registrationId: string,
  input: ApproveRegistrationInput = {},
  notifications: NotificationService = consoleNotificationService
): Promise<WorkshopRegistration> {
  const registration = await requireProofSubmitted(registrationId);

  const whatsappGroupInviteUrl = input.whatsappGroupInviteUrl?.trim() || registration.whatsappGroupInviteUrl;

  if (!whatsappGroupInviteUrl && !input.allowMissingWhatsappLink) {
    throw new VerificationError(
      "Add the WhatsApp group invitation link before approving, or explicitly allow approving without one",
      "WHATSAPP_LINK_REQUIRED",
      400
    );
  }
  if (whatsappGroupInviteUrl && !isValidWhatsAppInviteUrl(whatsappGroupInviteUrl)) {
    throw new VerificationError(
      "That doesn't look like a WhatsApp invite link (expected a wa.me or chat.whatsapp.com URL)",
      "INVALID_WHATSAPP_URL",
      400
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.workshopRegistration.update({
      where: { id: registration.id },
      data: {
        status: "APPROVED",
        ...(whatsappGroupInviteUrl ? { whatsappGroupInviteUrl } : {}),
      },
    });

    await tx.paymentVerificationLog.create({
      data: { registrationId: registration.id, action: "APPROVED", note: input.note, adminId },
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
