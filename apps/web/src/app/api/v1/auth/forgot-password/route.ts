import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { generatePasswordResetToken } from "@/lib/auth";
import { successResponse, parseBody } from "@/lib/api/response";
import { forgotPasswordSchema } from "@cms/shared";

const GENERIC_MESSAGE =
  "If an account exists for that email, a password reset link has been sent.";

export async function POST(req: NextRequest) {
  const parsed = await parseBody(req, forgotPasswordSchema);
  if (parsed.error) return parsed.error;

  const { email } = parsed.data;

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    // Always return the same generic message to avoid leaking
    // whether an email address is registered.
    if (!user) {
      return successResponse({ message: GENERIC_MESSAGE });
    }

    const { token, hash, expiresAt } = generatePasswordResetToken();

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: hash,
        passwordResetExpiry: expiresAt,
      },
    });

    const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/reset-password?token=${token}`;

    // TODO: wire up a transactional email provider. For now, log the
    // reset link so it can be used during local development.
    console.log(`[password-reset] ${email} → ${resetUrl}`);

    return successResponse({ message: GENERIC_MESSAGE });
  } catch (error) {
    console.error("Forgot password error:", error);
    // Still return the generic message — never confirm/deny failure details.
    return successResponse({ message: GENERIC_MESSAGE });
  }
}
