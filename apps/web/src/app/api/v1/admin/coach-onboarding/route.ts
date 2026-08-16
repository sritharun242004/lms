import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { coachEmailApprovalSchema } from "@cms/shared";
import { errorResponse, parseBody, successResponse } from "@/lib/api/response";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  if (user.role !== "ADMIN") return errorResponse("Super Admin access required", "FORBIDDEN", 403);

  const parsed = await parseBody(req, coachEmailApprovalSchema);
  if (parsed.error) return parsed.error;

  const existingUser = await prisma.user.findUnique({ where: { email: parsed.data.email }, select: { id: true } });
  if (existingUser) return errorResponse("This email already has an account", "EMAIL_IN_USE", 409);

  try {
    const approval = await prisma.coachEmailApproval.create({
      data: { email: parsed.data.email, approvedById: user.id },
      select: { id: true, email: true, createdAt: true, claimedAt: true },
    });
    return successResponse({ approval }, undefined, 201);
  } catch {
    return errorResponse("This participant email has already been approved", "EMAIL_ALREADY_APPROVED", 409);
  }
}
