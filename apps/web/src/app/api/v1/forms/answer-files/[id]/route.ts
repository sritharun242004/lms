import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse } from "@/lib/api/response";
import { uploadedFileHeaders } from "@/lib/api/file-response";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  // Answer files belong to form responses, which only staff review. Files
  // carry no uploader, so a participant could otherwise read anyone's by id.
  if (user.role !== "ADMIN" && user.role !== "MENTOR") {
    return errorResponse("You don't have access to this file", "FORBIDDEN", 403);
  }

  const { id } = await params;
  const file = await prisma.formAnswerFile.findUnique({ where: { id } });
  if (!file) return errorResponse("File not found", "NOT_FOUND", 404);

  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      ...uploadedFileHeaders({ fileName: file.fileName, mimeType: file.mimeType, size: file.size, inline: true }),
      "Cache-Control": "private, no-store",
    },
  });
}
