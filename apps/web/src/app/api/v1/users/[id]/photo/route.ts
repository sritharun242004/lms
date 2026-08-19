import { NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { errorResponse } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { canViewUserPhoto } from "@/lib/photos/access";
import { photoResponse } from "@/lib/photos/response";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const viewer = await getCurrentUser();
  if (!viewer) return errorResponse("Authentication required", "UNAUTHORIZED", 401);

  const { id } = await params;
  if (!(await canViewUserPhoto(viewer, id))) {
    return errorResponse("You don't have permission to view this profile photo", "FORBIDDEN", 403);
  }

  const photo = await prisma.userProfilePhoto.findUnique({
    where: { userId: id },
    select: { data: true, mimeType: true, size: true, updatedAt: true },
  });

  if (!photo) return errorResponse("Profile photo not found", "PHOTO_NOT_FOUND", 404);
  return photoResponse(photo, request);
}
