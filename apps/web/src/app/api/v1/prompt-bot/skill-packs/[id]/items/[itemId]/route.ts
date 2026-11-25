import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse } from "@/lib/api/response";
import { loadItemDetail } from "@/lib/skills/packs";

/** One legacy skill with its files, read-only. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const { id, itemId } = await params;
  const view = await loadItemDetail(id, itemId, user.id);
  return view ? successResponse(view) : errorResponse("Skill not found", "NOT_FOUND", 404);
}
