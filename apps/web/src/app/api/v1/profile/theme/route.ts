import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { updateThemePreference, ThemePreferenceError } from "@/lib/theme/preference";
import { errorResponse, successResponse } from "@/lib/api/response";

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);

  try {
    const body = await req.json();
    const palette = await updateThemePreference(user.id, String(body.themePreference ?? ""));
    return successResponse({ themePreference: palette });
  } catch (error) {
    if (error instanceof ThemePreferenceError) return errorResponse(error.message, error.code, error.status);
    throw error;
  }
}
