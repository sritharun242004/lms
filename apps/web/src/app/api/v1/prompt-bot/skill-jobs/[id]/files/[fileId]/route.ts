import { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { successResponse, validationErrorResponse } from "@/lib/api/response";
import { deleteJobFile, loadFileDetail, saveAnalysisEdit } from "@/lib/skills/jobs/files";
import { jobErrorResponse, notFound, readJobJson, unauthorized } from "@/lib/skills/jobs/http";
import { JOB_LIMITS } from "@/lib/skills/limits";

type Ctx = { params: Promise<{ id: string; fileId: string }> };
const PatchBody = z.object({ analysis: z.string().trim().min(1).max(JOB_LIMITS.analysisChars) });

export async function GET(_req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id, fileId } = await params;
  const detail = await loadFileDetail(id, fileId, user.id);
  return detail ? successResponse(detail) : notFound("File");
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id, fileId } = await params;
  const body = await readJobJson(req);
  if (!body.ok) return body.response;
  const parsed = PatchBody.safeParse(body.value);
  if (!parsed.success) return validationErrorResponse(parsed.error);
  try {
    return successResponse(await saveAnalysisEdit(id, fileId, user.id, parsed.data.analysis));
  } catch (error) {
    const res = jobErrorResponse(error);
    if (res) return res;
    throw error;
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id, fileId } = await params;
  try {
    await deleteJobFile(id, fileId, user.id);
    return successResponse({ deleted: true });
  } catch (error) {
    const res = jobErrorResponse(error);
    if (res) return res;
    throw error;
  }
}
