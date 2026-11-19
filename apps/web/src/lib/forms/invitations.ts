import { prisma } from "@/lib/db/prisma";
import { requireStaff, FormError } from "./form-service";

type Actor = { id: string; role: string };

export async function getInvitationForFilling(actor: Actor, invitationId: string) {
  const invitation = await prisma.formInvitation.findUnique({
    where: { id: invitationId },
    include: {
      response: true,
      form: {
        include: { sections: { orderBy: { order: "asc" }, include: { questions: { orderBy: { order: "asc" } } } } },
      },
    },
  });
  if (!invitation) throw new FormError("Invitation not found", "NOT_FOUND", 404);
  if (invitation.recipientUserId !== actor.id) {
    throw new FormError("This invitation is not addressed to you", "FORBIDDEN", 403);
  }

  if (invitation.status === "SENT") {
    await prisma.formInvitation.update({ where: { id: invitationId }, data: { status: "OPENED", openedAt: new Date() } });
    invitation.status = "OPENED";
  }

  return invitation;
}

// Creates one invitation per recipient a form is being sent to (e.g. every
// current member of the group chat it's shared into), each independently
// addressed and independently tracked to SUBMITTED.
export async function createInvitations(
  actor: Actor,
  input: { formId: string; recipientUserIds: string[]; messageId?: string; groupId?: string }
) {
  requireStaff(actor);
  const form = await prisma.form.findUnique({ where: { id: input.formId } });
  if (!form) throw new FormError("Form not found", "NOT_FOUND", 404);
  if (form.status !== "PUBLISHED") {
    throw new FormError("Only a published form can be sent", "NOT_PUBLISHED", 400);
  }

  return prisma.$transaction(
    input.recipientUserIds.map((recipientUserId) =>
      prisma.formInvitation.create({
        data: {
          formId: input.formId,
          messageId: input.messageId,
          groupId: input.groupId,
          recipientUserId,
        },
      })
    )
  );
}

// Posts a FORM message into a group chat and creates one invitation per
// current MENTEE member — mirrors the existing poll/word-cloud send flow
// (message + per-recipient interactive state created together).
export async function sendFormToGroup(actor: Actor, groupId: string, formId: string) {
  requireStaff(actor);
  const form = await prisma.form.findUnique({ where: { id: formId } });
  if (!form) throw new FormError("Form not found", "NOT_FOUND", 404);
  if (form.status !== "PUBLISHED") {
    throw new FormError("Only a published form can be sent", "NOT_PUBLISHED", 400);
  }

  const members = await prisma.groupMember.findMany({
    where: { groupId, role: "MENTEE" },
    select: { userId: true },
  });
  if (members.length === 0) {
    throw new FormError("This group has no participants to send the form to", "NO_RECIPIENTS", 400);
  }

  return prisma.$transaction(async (tx) => {
    const message = await tx.message.create({
      data: { content: form.title, type: "FORM", groupId, senderId: actor.id },
    });
    await tx.formInvitation.createMany({
      data: members.map((member) => ({
        formId,
        messageId: message.id,
        groupId,
        recipientUserId: member.userId,
      })),
    });
    return message.id;
  });
}
