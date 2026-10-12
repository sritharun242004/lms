import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getGroupAccess } from "@/lib/groups/access";
import {
  attachmentUrl,
  clampLimit,
  extractLinks,
  isSharedKind,
} from "@/lib/groups/profile";
import { successResponse, errorResponse } from "@/lib/api/response";

const MEDIA_FILTER = [
  { mimeType: { startsWith: "image/" } },
  { mimeType: { startsWith: "video/" } },
];

/**
 * Shared content of ONE group, newest first, one page at a time:
 *   ?kind=media      images and videos
 *   ?kind=documents  every other attachment
 *   ?kind=links      http(s) links found in message text
 *
 * Every query is pinned to the group id from the URL after the caller's
 * membership has been checked, deleted messages are excluded, and the file
 * bytes are never selected - only metadata. Files themselves are opened through
 * the existing attachment endpoint, which re-checks membership.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  }

  const { id: groupId } = await params;
  const access = await getGroupAccess(groupId, user);
  if (!access.canView) {
    return errorResponse("Group not found", "GROUP_NOT_FOUND", 404);
  }

  const kind = req.nextUrl.searchParams.get("kind");
  if (!isSharedKind(kind)) {
    return errorResponse("kind must be media, documents or links", "VALIDATION_ERROR", 400);
  }
  const limit = clampLimit(req.nextUrl.searchParams.get("limit"), 30, 50);
  const cursor = req.nextUrl.searchParams.get("cursor");
  const paging = {
    orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  };

  if (kind === "links") {
    const rows = await prisma.message.findMany({
      where: {
        groupId,
        isDeleted: false,
        type: { in: ["TEXT", "ANNOUNCEMENT", "FILE", "IMAGE"] },
        OR: [
          { content: { contains: "http://", mode: "insensitive" } },
          { content: { contains: "https://", mode: "insensitive" } },
        ],
      },
      ...paging,
      select: {
        id: true,
        content: true,
        createdAt: true,
        sender: { select: { id: true, name: true } },
      },
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const items = page.flatMap((row: (typeof page)[number]) =>
      extractLinks(row.content).map((link) => ({
        id: `${row.id}:${link.url}`,
        messageId: row.id,
        url: link.url,
        domain: link.domain,
        sharedAt: row.createdAt.toISOString(),
        sender: row.sender,
      }))
    );
    return successResponse({ items, nextCursor: hasMore ? page[page.length - 1].id : null });
  }

  const rows = await prisma.message.findMany({
    where: {
      groupId,
      isDeleted: false,
      attachment: {
        is:
          kind === "media"
            ? { OR: MEDIA_FILTER }
            : { NOT: { OR: MEDIA_FILTER } },
      },
    },
    ...paging,
    select: {
      id: true,
      createdAt: true,
      attachmentName: true,
      sender: { select: { id: true, name: true } },
      attachment: { select: { fileName: true, mimeType: true, size: true } },
    },
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const items = page
    .filter((row: (typeof page)[number]) => row.attachment !== null)
    .map((row: (typeof page)[number]) => ({
      id: row.id,
      messageId: row.id,
      fileName: row.attachment!.fileName || row.attachmentName || "Attachment",
      mimeType: row.attachment!.mimeType,
      size: row.attachment!.size,
      url: attachmentUrl(groupId, row.id),
      sharedAt: row.createdAt.toISOString(),
      sender: row.sender,
    }));

  return successResponse({ items, nextCursor: hasMore ? page[page.length - 1].id : null });
}
