import type { NextRequest } from "next/server";
import { AuditAction } from "@cms/shared";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse } from "@/lib/api/response";

type RegistrationRouteContext = { params: Promise<{ id: string }> };

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
