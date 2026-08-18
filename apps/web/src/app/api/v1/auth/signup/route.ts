import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { hashPassword, generateAccessToken, generateRefreshToken, setAuthCookies, storeRefreshToken } from "@/lib/auth";
import { errorResponse, parseBody, successResponse } from "@/lib/api/response";
import { coachSignupSchema } from "@cms/shared";

export async function POST(req: NextRequest) {
  const parsed = await parseBody(req, coachSignupSchema);
  if (parsed.error) return parsed.error;

  const { name, email, password } = parsed.data;
  const [existingUser, approval] = await Promise.all([
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
    prisma.coachEmailApproval.findUnique({ where: { email } }),
  ]);

  if (existingUser) return errorResponse("An account already exists for this email", "EMAIL_IN_USE", 409);
  if (!approval || approval.claimedAt) {
    return errorResponse("This email has not been approved for coach onboarding", "COACH_EMAIL_NOT_APPROVED", 403);
  }

  try {
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { name, email, password: await hashPassword(password), role: "MENTOR", emailVerified: true },
        select: {
          id: true, name: true, email: true, role: true, avatarUrl: true,
          emailVerified: true, authVersion: true,
        },
      });
      await tx.coachEmailApproval.update({
        where: { id: approval.id },
        data: { claimedAt: new Date(), claimedById: created.id },
      });
      return created;
    });

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user, true);
    await storeRefreshToken(user.id, refreshToken, true);
    await setAuthCookies(accessToken, refreshToken, true);

    const publicUser = {
      id: user.id, name: user.name, email: user.email, role: user.role,
      avatarUrl: user.avatarUrl, emailVerified: user.emailVerified,
    };
    return successResponse({ user: publicUser, accessToken, refreshToken }, undefined, 201);
  } catch (error) {
    console.error("Coach signup error:", error);
    return errorResponse("Unable to create coach account", "COACH_SIGNUP_ERROR", 500);
  }
}
