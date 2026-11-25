import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse } from "@/lib/api/response";
import { normalizeSkillName } from "@/lib/skills/names";
import { loadPackView, loadReadySkillFiles } from "@/lib/skills/packs";
import { buildPackZip, DuplicateSkillNameError, zipResponse } from "@/lib/skills/zip";

/** Legacy pack download (read-only packs from before the Jobs redesign). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const { id } = await params;
  const pack = await loadPackView(id, user.id);
  if (!pack) return errorResponse("Skill pack not found", "NOT_FOUND", 404);
  const skills = await loadReadySkillFiles(id, user.id);
  if (skills.length === 0) return errorResponse("This pack has no finished skills to download.", "NOTHING_TO_DOWNLOAD", 409);
  const slug = normalizeSkillName(pack.title, "skill-pack");
  try {
    return zipResponse(buildPackZip({ slug, title: pack.title, description: pack.description, role: pack.role, skills }), `${slug}.zip`);
  } catch (error) {
    if (!(error instanceof DuplicateSkillNameError)) throw error;
    return errorResponse(`Two skills are named "${error.skillName}". Download them one at a time.`, "DUPLICATE_NAME", 409);
  }
}
