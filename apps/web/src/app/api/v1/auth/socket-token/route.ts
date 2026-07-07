import { getAccessTokenFromCookies, verifyAccessToken } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/api/response";

/**
 * Relays the caller's own (already-valid, httpOnly-cookie) access
 * token back to client-side JS so it can be handed to the Socket.IO
 * handshake — sockets can't read httpOnly cookies directly.
 */
export async function GET() {
  const token = await getAccessTokenFromCookies();
  if (!token || !verifyAccessToken(token)) {
    return errorResponse("Not authenticated", "UNAUTHORIZED", 401);
  }

  return successResponse({ token });
}
