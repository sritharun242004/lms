import { NextRequest } from "next/server";
import { findRegistrationByCode } from "@/lib/workshop/registration";
import { errorResponse, successResponse } from "@/lib/api/response";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const registration = await findRegistrationByCode(code);
  if (!registration) return errorResponse("Registration not found", "NOT_FOUND", 404);

  // Unauthenticated, code-based lookup — anyone who knows (or guesses,
  // since codes are sequential) a registration code can hit this. Only
  // return the fields the participant's own status page actually
  // renders, never email/WhatsApp number/company/GSTIN/etc.
  return successResponse({
    registration: {
      registrationCode: registration.registrationCode,
      status: registration.status,
      workshopPackage: registration.workshopPackage,
      amountInInr: registration.amountInInr,
      whatsappGroupInviteUrl: registration.whatsappGroupInviteUrl,
    },
  });
}
