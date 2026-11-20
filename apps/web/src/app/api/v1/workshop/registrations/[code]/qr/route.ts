import { NextRequest } from "next/server";
import { findRegistrationByCode } from "@/lib/workshop/registration";
import { STATIC_PAYMENT_QR_SRC, generatePaymentQrDataUrl, isDemoPaymentMode } from "@/lib/payments/qr-provider";
import { errorResponse, successResponse } from "@/lib/api/response";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const registration = await findRegistrationByCode(code);
  if (!registration) return errorResponse("Registration not found", "NOT_FOUND", 404);

  if (STATIC_PAYMENT_QR_SRC) return successResponse({ qrDataUrl: STATIC_PAYMENT_QR_SRC, demoMode: false });

  const qrDataUrl = await generatePaymentQrDataUrl({
    registrationCode: registration.registrationCode,
    amountInInr: registration.amountInInr,
  });
  return successResponse({ qrDataUrl, demoMode: isDemoPaymentMode() });
}
