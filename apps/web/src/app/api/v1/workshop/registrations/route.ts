import { NextRequest } from "next/server";
import { createRegistration, RegistrationError } from "@/lib/workshop/registration";
import { errorResponse, successResponse } from "@/lib/api/response";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const registration = await createRegistration(body);
    return successResponse({ registration }, undefined, 201);
  } catch (error) {
    if (error instanceof RegistrationError) {
      return errorResponse(error.message, error.code, error.status);
    }
    // The participant only sees the generic message, so the cause has to
    // reach the server logs or a failure like a code clash stays invisible.
    console.error("[workshop] registration failed", error);
    return errorResponse("Unable to complete registration", "REGISTRATION_ERROR", 500);
  }
}
