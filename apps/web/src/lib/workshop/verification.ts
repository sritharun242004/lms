import { prisma } from "@/lib/db/prisma";
import { consoleNotificationService, type NotificationService } from "./notifications";
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
  // A reusable WhatsAppGroup's id, selected by the admin from a
  // dropdown of active groups during approval. Optional only when the
  // registration already has a group saved from a prior approval
  // attempt, or when `allowMissingWhatsappLink` is explicitly set — the
  // workshop's own explicit exception path, never a silent default.
  // Never a raw URL: groups are created/edited once in WhatsApp Group
  // management and only ever selected here, never typed in by hand.
  whatsappGroupId?: string;
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

  // Snapshot the group's current name/link at approval time. A group
  // selected here is never re-read later — editing or deleting the
  // WhatsAppGroup row afterward must never change what an already
  // approved participant was told, so the registration keeps its own
  // copy rather than a live reference.
  let whatsappGroupId = registration.whatsappGroupId;
  let whatsappGroupName = registration.whatsappGroupName;
  let whatsappGroupInviteUrl = registration.whatsappGroupInviteUrl;

  if (input.whatsappGroupId) {
    const group = await prisma.whatsAppGroup.findUnique({ where: { id: input.whatsappGroupId } });
    if (!group || !group.isActive) {
      throw new VerificationError(
        "Selected WhatsApp group is not available. Choose an active group.",
        "INVALID_WHATSAPP_GROUP",
        400
      );
    }
    whatsappGroupId = group.id;
    whatsappGroupName = group.name;
    whatsappGroupInviteUrl = group.inviteUrl;
  }

  if (!whatsappGroupInviteUrl && !input.allowMissingWhatsappLink) {
    throw new VerificationError(
      "Select a WhatsApp group before approving, or explicitly allow approving without one",
      "WHATSAPP_LINK_REQUIRED",
      400
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.workshopRegistration.update({
      where: { id: registration.id },
      data: {
        status: "APPROVED",
        whatsappGroupId,
        whatsappGroupName,
        whatsappGroupInviteUrl,
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
