import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse } from "@/lib/api/response";
import { buildVersionZip, parseVersionParam } from "@/lib/skills/jobs/download";
import { jobErrorResponse, unauthorized } from "@/lib/skills/jobs/http";
import { zipResponse } from "@/lib/skills/zip";

type Ctx = { params: Promise<{ id: string; skillId: string; version: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id, skillId, version } = await params;
  const parsed = parseVersionParam(version);
  if (parsed === null) return errorResponse('Use a version number or "latest".', "VALIDATION_ERROR", 400);
  const format = req.nextUrl.searchParams.get("format") ?? "upload";
  if (format !== "upload" && format !== "pack") return errorResponse('Use format "upload" or "pack".', "VALIDATION_ERROR", 400);
  try {
    const zip = await buildVersionZip(id, skillId, parsed, user.id, format);
    return zipResponse(zip.bytes, zip.filename);
  } catch (error) {
    const mapped = jobErrorResponse(error);
    if (mapped) return mapped;
    throw error;
  }
}
