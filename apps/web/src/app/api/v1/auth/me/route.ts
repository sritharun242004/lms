import { getCurrentUser } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/api/response";

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return errorResponse("Not authenticated", "UNAUTHORIZED", 401);
    }

    return successResponse({ user });
  } catch (error) {
    console.error("Get current user error:", error);
    return errorResponse("Failed to get user", "AUTH_ERROR", 500);
  }
}
