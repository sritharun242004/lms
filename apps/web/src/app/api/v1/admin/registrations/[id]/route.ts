import type { NextRequest } from "next/server";
import { z } from "zod";
import { AuditAction } from "@cms/shared";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, parseBody, successResponse } from "@/lib/api/response";

type RegistrationRouteContext = { params: Promise<{ id: string }> };

const paymentUpdateSchema = z.object({ paid: z.boolean() });

// The admin's own check that the money arrived. It never touches the
// participant's "Payment Done" claim (status / paymentMarkedDoneAt): the two
// are separate facts, and the list shows both.
export async function PATCH(req: NextRequest, context: RegistrationRouteContext) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return errorResponse("Admin access required", "FORBIDDEN", 403);
  }

  const body = await parseBody(req, paymentUpdateSchema);
  if (body.error) return body.error;
  const { paid } = body.data;

  const { id } = await context.params;
  const updated = await prisma.$transaction(async (tx) => {
    const registration = await tx.workshopRegistration.findUnique({ where: { id } });
    if (!registration) return null;
    const next = await tx.workshopRegistration.update({
      where: { id },
      data: { paymentVerifiedAt: paid ? (registration.paymentVerifiedAt ?? new Date()) : null },
    });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: AuditAction.WORKSHOP_REGISTRATION_PAYMENT_UPDATED,
        entityType: "WorkshopRegistration",
        entityId: id,
        metadata: {
          registrationCode: registration.registrationCode,
          wasVerified: registration.paymentVerifiedAt !== null,
          verified: next.paymentVerifiedAt !== null,
        },
      },
    });
    return next;
  });

  if (!updated) {
    return errorResponse("Registration not found", "NOT_FOUND", 404);
  }
  return successResponse({ registration: updated });
}

// A hard delete — registrations have no dependent rows. The audit entry keeps
// enough to say what was removed and by whom, but not the contact details,
// so deleting someone's registration actually removes their personal data.
export async function DELETE(_req: NextRequest, context: RegistrationRouteContext) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return errorResponse("Admin access required", "FORBIDDEN", 403);
  }

  const { id } = await context.params;
  const deleted = await prisma.$transaction(async (tx) => {
    const registration = await tx.workshopRegistration.findUnique({ where: { id } });
    if (!registration) return null;
    await tx.workshopRegistration.delete({ where: { id } });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: AuditAction.WORKSHOP_REGISTRATION_DELETED,
        entityType: "WorkshopRegistration",
        entityId: id,
        metadata: {
          registrationCode: registration.registrationCode,
          fullName: registration.fullName,
          workshopPackage: registration.workshopPackage,
          status: registration.status,
          amountInInr: registration.amountInInr,
        },
      },
    });
    return registration;
  });

  if (!deleted) {
    return errorResponse("Registration not found", "NOT_FOUND", 404);
  }
  return successResponse({ id: deleted.id });
}
