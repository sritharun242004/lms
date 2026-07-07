import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { generateInviteCode } from "@/lib/utils";
import { successResponse, errorResponse, parseBody } from "@/lib/api/response";
import { createGroupSchema, AuditAction } from "@lms/shared";

/**
 * List groups visible to the current user:
 * - Admin: every group in the system.
 * - Mentor: only groups they created.
 * - Mentee: only groups they've joined (no invite code, no owner actions).
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  }

  try {
    if (user.role === "MENTEE") {
      const memberships = await prisma.groupMember.findMany({
        where: { userId: user.id },
        select: {
          group: {
            select: {
              id: true,
              name: true,
              description: true,
              wallpaperUrl: true,
              createdAt: true,
              createdBy: { select: { name: true } },
              _count: { select: { members: true } },
            },
          },
        },
        orderBy: { joinedAt: "desc" },
      });

      const groups = memberships.map((m: (typeof memberships)[number]) => ({
        id: m.group.id,
        name: m.group.name,
        description: m.group.description,
        wallpaperUrl: m.group.wallpaperUrl,
        createdAt: m.group.createdAt,
        mentorName: m.group.createdBy.name,
        memberCount: m.group._count.members,
        inviteCode: null,
        canManage: false,
      }));

      return successResponse({ groups });
    }

    const where = user.role === "ADMIN" ? {} : { createdById: user.id };

    const groups = await prisma.group.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        description: true,
        wallpaperUrl: true,
        createdAt: true,
        createdBy: { select: { name: true } },
        _count: { select: { members: true } },
        inviteCodes: {
          where: { isActive: true },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, code: true, isActive: true, usageCount: true },
        },
      },
    });

    return successResponse({
      groups: groups.map((g: (typeof groups)[number]) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        wallpaperUrl: g.wallpaperUrl,
        createdAt: g.createdAt,
        mentorName: g.createdBy.name,
        memberCount: g._count.members,
        inviteCode: g.inviteCodes[0] ?? null,
        canManage: true,
      })),
    });
  } catch (error) {
    console.error("List groups error:", error);
    return errorResponse("Failed to load groups", "GROUPS_FETCH_ERROR", 500);
  }
}

/**
 * Create a group. Only mentors and admins may create groups. The
 * creator is automatically added as the group's OWNER member and a
 * fresh, unique invite code is generated.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  }
  if (user.role !== "ADMIN" && user.role !== "MENTOR") {
    return errorResponse("Only mentors can create groups", "FORBIDDEN", 403);
  }

  const parsed = await parseBody(req, createGroupSchema);
  if (parsed.error) return parsed.error;

  const { name, description } = parsed.data;

  try {
    // Generate a unique invite code, retrying on the (astronomically
    // unlikely) chance of a collision.
    let code = generateInviteCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      const existing = await prisma.inviteCode.findUnique({ where: { code } });
      if (!existing) break;
      code = generateInviteCode();
    }

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const group = await tx.group.create({
        data: { name, description, createdById: user.id },
      });

      const inviteCode = await tx.inviteCode.create({
        data: { code, groupId: group.id, createdById: user.id },
      });

      await tx.groupMember.create({
        data: { userId: user.id, groupId: group.id, role: "OWNER" },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: AuditAction.GROUP_CREATED,
          entityType: "Group",
          entityId: group.id,
          metadata: { name },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: AuditAction.INVITE_GENERATED,
          entityType: "Group",
          entityId: group.id,
          metadata: { code },
        },
      });

      return { group, inviteCode };
    });

    return successResponse(
      {
        id: result.group.id,
        name: result.group.name,
        description: result.group.description,
        wallpaperUrl: result.group.wallpaperUrl,
        createdAt: result.group.createdAt,
        mentorName: user.name,
        memberCount: 1,
        inviteCode: {
          id: result.inviteCode.id,
          code: result.inviteCode.code,
          isActive: true,
          usageCount: 0,
        },
        canManage: true,
      },
      undefined,
      201
    );
  } catch (error) {
    console.error("Create group error:", error);
    return errorResponse("Failed to create group", "GROUP_CREATE_ERROR", 500);
  }
}
