import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse } from "@/lib/api/response";
import { createWhatsAppGroup, listWhatsAppGroups, WhatsAppGroupError } from "@/lib/workshop/whatsapp-groups";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return errorResponse("Admin access required", "FORBIDDEN", 403);
  }

  const groups = await listWhatsAppGroups();
  return successResponse({ groups });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return errorResponse("Admin access required", "FORBIDDEN", 403);
  }

  try {
    const body = await req.json();
    const group = await createWhatsAppGroup(body);
    return successResponse({ group }, undefined, 201);
  } catch (error) {
    if (error instanceof WhatsAppGroupError) {
      return errorResponse(error.message, error.code, error.status);
    }
    throw error;
  }
}
