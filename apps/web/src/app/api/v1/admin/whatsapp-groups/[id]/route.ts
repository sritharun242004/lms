import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse } from "@/lib/api/response";
import { deleteWhatsAppGroup, updateWhatsAppGroup, WhatsAppGroupError } from "@/lib/workshop/whatsapp-groups";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return errorResponse("Admin access required", "FORBIDDEN", 403);
  }

  const { id } = await params;

  try {
    const body = await req.json();
    const group = await updateWhatsAppGroup(id, body);
    return successResponse({ group });
  } catch (error) {
    if (error instanceof WhatsAppGroupError) {
      return errorResponse(error.message, error.code, error.status);
    }
    throw error;
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return errorResponse("Admin access required", "FORBIDDEN", 403);
  }

  const { id } = await params;

  try {
    await deleteWhatsAppGroup(id);
    return successResponse({ deleted: true });
  } catch (error) {
    if (error instanceof WhatsAppGroupError) {
      return errorResponse(error.message, error.code, error.status);
    }
    throw error;
  }
}
