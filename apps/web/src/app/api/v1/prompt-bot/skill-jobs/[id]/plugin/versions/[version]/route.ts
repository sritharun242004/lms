import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse } from "@/lib/api/response";
import { parseVersionParam } from "@/lib/skills/jobs/download";
import { notFound, unauthorized } from "@/lib/skills/jobs/http";
import { loadPluginVersionDetail } from "@/lib/skills/jobs/plugin-download";

type Ctx = { params: Promise<{ id: string; version: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id, version } = await params;
  const parsed = parseVersionParam(version);
  if (parsed === null) return errorResponse('Use a version number or "latest".', "VALIDATION_ERROR", 400);
  const detail = await loadPluginVersionDetail(id, parsed, user.id);
  return detail ? successResponse(detail) : notFound("Version");
}
