import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse } from "@/lib/api/response";
import { loadItemDetail } from "@/lib/skills/packs";
import { buildSkillZip, zipResponse } from "@/lib/skills/zip";

/** One legacy skill as its upload zip. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const { id, itemId } = await params;
  const item = await loadItemDetail(id, itemId, user.id);
  if (!item) return errorResponse("Skill not found", "NOT_FOUND", 404);
  // loadItemDetail returns only finished custom skills; files are null when none are stored or they can't be read.
  if (!item.files) return errorResponse("This skill has no files to download.", "NOTHING_TO_DOWNLOAD", 409);
  return zipResponse(buildSkillZip({ name: item.name, purpose: item.purpose, files: item.files }), `${item.name}.zip`);
}
