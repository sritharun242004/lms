import { NextRequest } from "next/server";
import { markPaymentDone, PaymentError } from "@/lib/workshop/payment";
import { errorResponse, successResponse } from "@/lib/api/response";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  try {
    const registration = await markPaymentDone(code);
    return successResponse({
      registration: {
        registrationCode: registration.registrationCode,
        status: registration.status,
        workshopPackage: registration.workshopPackage,
        amountInInr: registration.amountInInr,
      },
    });
  } catch (error) {
    if (error instanceof PaymentError) {
      return errorResponse(error.message, error.code, error.status);
    }
    return errorResponse("Unable to update your registration", "PAYMENT_ERROR", 400);
  }
}
