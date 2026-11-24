import { prisma } from "@/lib/db/prisma";
import type { WorkshopRegistration } from "@prisma/client";

export class PaymentError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) {
    super(message);
    this.name = "PaymentError";
  }
}

// The only payment "verification" this application does: the
// participant tells us they paid. No proof, no admin approval step —
// an admin follows up with them directly outside the app. Idempotent
// on purpose, since a participant may click the button twice (a slow
// network, a reload) and that must never be an error.
export async function markPaymentDone(registrationCode: string): Promise<WorkshopRegistration> {
  const registration = await prisma.workshopRegistration.findUnique({ where: { registrationCode } });
  if (!registration) {
    throw new PaymentError("Registration not found", "NOT_FOUND", 404);
  }
  if (registration.status === "PAYMENT_DONE") {
    return registration;
  }
  return prisma.workshopRegistration.update({
    where: { id: registration.id },
    data: { status: "PAYMENT_DONE", paymentMarkedDoneAt: new Date() },
  });
}
