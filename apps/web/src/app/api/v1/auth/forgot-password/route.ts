import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { generatePasswordResetToken } from "@/lib/auth";
import { errorResponse, successResponse, parseBody } from "@/lib/api/response";
import { forgotPasswordSchema } from "@cms/shared";
import { parseAuthPortal } from "@/lib/auth/portal-navigation";

const GENERIC_MESSAGE =
  "If an account exists for that email, a password reset link has been sent.";

function deliverResetLinkToDevelopmentConsole(email: string, resetUrl: string) {
  if (process.env.NODE_ENV === "production") return;
  console.log(`[password-reset] ${email} → ${resetUrl}`);
}

export async function POST(req: NextRequest) {
  const parsed = await parseBody(req, forgotPasswordSchema);
  if (parsed.error) return parsed.error;

  // No transactional email provider is configured. Production must not mint
  // a credential that it cannot deliver safely, and must never log raw links.
  if (process.env.NODE_ENV === "production") {
    return errorResponse(
      "Password recovery is temporarily unavailable. Please contact your administrator.",
      "PASSWORD_RECOVERY_UNAVAILABLE",
      503
    );
  }

  const { email } = parsed.data;
  const portal = parseAuthPortal(req.nextUrl.searchParams.get("portal"));

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

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
    const resetUrl = `${appUrl}/reset-password?token=${encodeURIComponent(token)}&portal=${portal}`;

    deliverResetLinkToDevelopmentConsole(email, resetUrl);

    return successResponse({ message: GENERIC_MESSAGE });
  } catch (error) {
    console.error("Forgot password error:", error);
    // Still return the generic message — never confirm/deny failure details.
    return successResponse({ message: GENERIC_MESSAGE });
  }
}
