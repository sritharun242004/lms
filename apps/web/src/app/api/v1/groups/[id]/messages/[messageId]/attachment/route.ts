import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getGroupAccess } from "@/lib/groups/access";
import { errorResponse } from "@/lib/api/response";

/** Any group member (mentor or mentee) may download an attachment they can see. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  }

  const { id: groupId, messageId } = await params;
  const access = await getGroupAccess(groupId, user);
  if (!access.canView) {
    return errorResponse("You don't have access to this group", "FORBIDDEN", 403);
  }

  const message = await prisma.message.findFirst({
    where: { id: messageId, groupId, isDeleted: false },
    select: { attachment: { select: { fileName: true, mimeType: true, size: true, data: true } } },
  });
  if (!message?.attachment) {
    return errorResponse("Attachment not found", "ATTACHMENT_NOT_FOUND", 404);
  }

  const { fileName, mimeType, size, data } = message.attachment;
  const isInline = req.nextUrl.searchParams.get("inline") === "1";
  const asciiFallback = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");

  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(size),
      "Content-Disposition": `${isInline ? "inline" : "attachment"}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
