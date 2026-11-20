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
    return errorResponse("Unable to complete registration", "REGISTRATION_ERROR", 400);
  }
}
