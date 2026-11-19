import { prisma } from "@/lib/db/prisma";
import type { WorkshopRegistration } from "@prisma/client";

export const MAX_PROOF_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_PROOF_MIME_TYPES = ["image/png", "image/jpeg", "application/pdf"];

export class PaymentProofError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) {
    super(message);
    this.name = "PaymentProofError";
  }
}

export async function submitPaymentProof(
  registrationCode: string,
  file: { mimeType: string; size: number; data: Buffer }
): Promise<WorkshopRegistration> {
  if (!ALLOWED_PROOF_MIME_TYPES.includes(file.mimeType)) {
    throw new PaymentProofError(
      "Unsupported file type. Upload a PNG, JPG, or PDF.",
      "INVALID_FILE_TYPE",
      400
    );
  }
  if (file.size > MAX_PROOF_SIZE_BYTES) {
    throw new PaymentProofError("File is too large. Maximum size is 10 MB.", "FILE_TOO_LARGE", 400);
  }

  const registration = await prisma.workshopRegistration.findFirst({
    where: { registrationCode },
  });
  if (!registration) {
    throw new PaymentProofError("Registration not found", "NOT_FOUND", 404);
  }

  return prisma.$transaction(async (tx) => {
    await tx.paymentProof.create({
      data: {
        registrationId: registration.id,
        mimeType: file.mimeType,
        size: file.size,
        data: new Uint8Array(file.data),
      },
    });
    return tx.workshopRegistration.update({
      where: { id: registration.id },
      data: { status: "PROOF_SUBMITTED" },
    });
  });
}
