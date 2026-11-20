import { NextRequest } from "next/server";
import { submitPaymentProof, PaymentProofError } from "@/lib/workshop/payment-proof";
import { errorResponse, successResponse } from "@/lib/api/response";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return errorResponse("Choose a file to upload", "FILE_REQUIRED", 400);

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const registration = await submitPaymentProof(code, {
      mimeType: file.type,
      size: file.size,
      data: buffer,
    });
    return successResponse({ registration }, undefined, 201);
  } catch (error) {
    if (error instanceof PaymentProofError) {
      return errorResponse(error.message, error.code, error.status);
    }
    return errorResponse("Unable to submit payment proof", "PAYMENT_PROOF_ERROR", 400);
  }
}
