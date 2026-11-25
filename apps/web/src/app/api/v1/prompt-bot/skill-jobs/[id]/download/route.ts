import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { buildJobPack } from "@/lib/skills/jobs/download";
import { jobErrorResponse, unauthorized } from "@/lib/skills/jobs/http";
import { zipResponse } from "@/lib/skills/zip";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await params;
  try {
    const zip = await buildJobPack(id, user.id);
    return zipResponse(zip.bytes, zip.filename);
  } catch (error) {
    const mapped = jobErrorResponse(error);
    if (mapped) return mapped;
    throw error;
  }
}
