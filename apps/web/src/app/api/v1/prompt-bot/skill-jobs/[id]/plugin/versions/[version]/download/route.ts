import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse } from "@/lib/api/response";
import { parseVersionParam } from "@/lib/skills/jobs/download";
import { jobErrorResponse, unauthorized } from "@/lib/skills/jobs/http";
import { downloadPluginVersion } from "@/lib/skills/jobs/plugin-download";
import { zipResponse } from "@/lib/skills/zip";

type Ctx = { params: Promise<{ id: string; version: string }> };

/** format=plugin (default): the zip to upload in Claude; format=share: README, readable files and that zip. */
export async function GET(req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id, version } = await params;
  const parsed = parseVersionParam(version);
  if (parsed === null) return errorResponse('Use a version number or "latest".', "VALIDATION_ERROR", 400);
  const format = req.nextUrl.searchParams.get("format") ?? "plugin";
  if (format !== "plugin" && format !== "share") return errorResponse('Use format "plugin" or "share".', "VALIDATION_ERROR", 400);
  try {
    const zip = await downloadPluginVersion(id, parsed, user.id, format);
    return zipResponse(zip.bytes, zip.filename);
  } catch (error) {
    const mapped = jobErrorResponse(error);
    if (mapped) return mapped;
    throw error;
  }
}
