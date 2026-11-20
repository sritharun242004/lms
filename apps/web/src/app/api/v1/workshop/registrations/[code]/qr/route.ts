import { NextRequest } from "next/server";
import { findRegistrationByCode } from "@/lib/workshop/registration";
import { generatePaymentQrDataUrl, isDemoPaymentMode } from "@/lib/payments/qr-provider";
import { errorResponse, successResponse } from "@/lib/api/response";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const registration = await findRegistrationByCode(code);
  if (!registration) return errorResponse("Registration not found", "NOT_FOUND", 404);

  const qrDataUrl = await generatePaymentQrDataUrl({
    registrationCode: registration.registrationCode,
    amountInInr: registration.amountInInr,
  });
  return successResponse({ qrDataUrl, demoMode: isDemoPaymentMode() });
}
