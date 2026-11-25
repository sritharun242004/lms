import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse } from "@/lib/api/response";
import { loadPackView } from "@/lib/skills/packs";

/** Legacy pack, read-only. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const { id } = await params;
  const view = await loadPackView(id, user.id);
  return view ? successResponse(view) : errorResponse("Skill pack not found", "NOT_FOUND", 404);
}
