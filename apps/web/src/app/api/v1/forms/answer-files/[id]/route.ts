import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse } from "@/lib/api/response";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);

  const { id } = await params;
  const file = await prisma.formAnswerFile.findUnique({ where: { id } });
  if (!file) return errorResponse("File not found", "NOT_FOUND", 404);

  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(file.size),
      "Content-Disposition": `inline; filename="${file.fileName.replace(/[^\x20-\x7e]/g, "_")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
