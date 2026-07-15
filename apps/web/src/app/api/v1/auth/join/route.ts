import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  generateAccessToken,
  generateRefreshToken,
  setAuthCookies,
  storeRefreshToken,
} from "@/lib/auth";
import {
  successResponse,
  errorResponse,
  parseBody,
} from "@/lib/api/response";
import { menteeJoinSchema, AuditAction } from "@cms/shared";

/**
 * Public, account-less mentee join: a name and an invite code are
 * enough to become a read-only member of a group. No email, no
 * password — a session is issued immediately so the mentee can start
 * reading announcements right away.
 */
export async function POST(req: NextRequest) {
  const parsed = await parseBody(req, menteeJoinSchema);
  if (parsed.error) return parsed.error;

  const { name, inviteCode } = parsed.data;

  try {
    const invite = await prisma.inviteCode.findUnique({
      where: { code: inviteCode },
      include: {
        group: {
          select: { id: true, name: true },
        },
      },
    });

    if (!invite) {
      return errorResponse("Invalid invite code", "INVALID_INVITE_CODE", 400);
    }

    if (!invite.isActive) {
      return errorResponse(
        "This invite code has been disabled",
        "INVITE_CODE_DISABLED",
        400
      );
    }

    if (invite.expiresAt && invite.expiresAt < new Date()) {
      return errorResponse(
        "This invite code has expired",
        "INVITE_CODE_EXPIRED",
        400
      );
    }

    if (invite.maxUsage && invite.usageCount >= invite.maxUsage) {
      return errorResponse(
        "This invite code has reached its usage limit",
        "INVITE_CODE_LIMIT",
        400
      );
    }

    const user = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const newUser = await tx.user.create({
        data: {
          name,
          role: "MENTEE",
          status: "ONLINE",
          lastSeenAt: new Date(),
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          avatarUrl: true,
          emailVerified: true,
        },
      });

      await tx.groupMember.create({
        data: {
          userId: newUser.id,
          groupId: invite.groupId,
          role: "MENTEE",
        },
      });

      await tx.inviteCode.update({
        where: { id: invite.id },
        data: { usageCount: { increment: 1 } },
      });

      await tx.auditLog.create({
        data: {
          userId: newUser.id,
          action: AuditAction.USER_SIGNUP,
          entityType: "User",
          entityId: newUser.id,
          metadata: {
            inviteCode,
            groupId: invite.groupId,
            groupName: invite.group.name,
            joinMethod: "guest",
          },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: newUser.id,
          action: AuditAction.MEMBER_JOINED,
          entityType: "Group",
          entityId: invite.groupId,
          metadata: {
            groupName: invite.group.name,
            joinMethod: "guest",
          },
        },
      });

      return newUser;
    });

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    await storeRefreshToken(user.id, refreshToken);
    await setAuthCookies(accessToken, refreshToken, true);

    await prisma.session.create({
      data: {
        userId: user.id,
        userAgent: req.headers.get("user-agent") || undefined,
        ipAddress:
          req.headers.get("x-forwarded-for")?.split(",")[0] ||
          req.headers.get("x-real-ip") ||
          undefined,
      },
    });

    return successResponse(
      {
        user,
        accessToken,
        refreshToken,
        joinedGroup: { id: invite.groupId, name: invite.group.name },
      },
      undefined,
      201
    );
  } catch (error) {
    console.error("Mentee join error:", error);
    return errorResponse("An error occurred while joining the group", "JOIN_ERROR", 500);
  }
}
