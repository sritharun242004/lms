import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse } from "@/lib/api/response";
import { normalizeSkillName } from "@/lib/skills/names";
import { loadPackView } from "@/lib/skills/packs";
import { buildPackZip, zipResponse } from "@/lib/skills/zip";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const { id } = await params;
  const pack = await loadPackView(id, user.id);
  if (!pack) return errorResponse("Skill pack not found", "NOT_FOUND", 404);
  const skills = pack.items.flatMap((item) =>
    item.kind === "CUSTOM" && item.status === "READY" && item.files ? [{ name: item.name, purpose: item.purpose, files: item.files }] : [],
  );
  if (skills.length === 0) return errorResponse("Generate at least one skill before downloading the pack.", "NOTHING_TO_DOWNLOAD", 409);
  const recommendations = pack.items.flatMap((item) =>
    item.kind === "CATALOG" && item.catalog
      ? [{ name: item.catalog.name, why: item.purpose, sourceUrl: item.catalog.sourceUrl, license: item.catalog.license, installNotes: item.catalog.installNotes }]
      : [],
  );
  const slug = normalizeSkillName(pack.title, "skill-pack");
  return zipResponse(
    buildPackZip({ slug, title: pack.title, description: pack.description, role: pack.role, skills, recommendations }),
    `${slug}.zip`,
  );
}
