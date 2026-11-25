import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse } from "@/lib/api/response";
import { loadVersionDetail, parseVersionParam } from "@/lib/skills/jobs/download";
import { notFound, unauthorized } from "@/lib/skills/jobs/http";

type Ctx = { params: Promise<{ id: string; skillId: string; version: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id, skillId, version } = await params;
  const parsed = parseVersionParam(version);
  if (parsed === null) return errorResponse('Use a version number or "latest".', "VALIDATION_ERROR", 400);
  const detail = await loadVersionDetail(id, skillId, parsed, user.id);
  return detail ? successResponse(detail) : notFound("Version");
}
