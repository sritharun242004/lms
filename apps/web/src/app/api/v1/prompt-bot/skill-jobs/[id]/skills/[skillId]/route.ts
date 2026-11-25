import { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { successResponse, validationErrorResponse } from "@/lib/api/response";
import { jobErrorResponse, readJobJson, unauthorized } from "@/lib/skills/jobs/http";
import { deleteSkill, updateSkill } from "@/lib/skills/jobs/skills";
import { JOB_LIMITS } from "@/lib/skills/limits";

type Ctx = { params: Promise<{ id: string; skillId: string }> };
const PatchBody = z
  .object({
    name: z.string().trim().min(1).max(JOB_LIMITS.skillNameChars).optional(),
    purpose: z.string().trim().min(1).max(JOB_LIMITS.skillPurposeChars).optional(),
    fileIds: z.array(z.string().min(1).max(64)).max(JOB_LIMITS.fileIdsPerSkill).optional(),
    order: z.number().int().min(0).max(1000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id, skillId } = await params;
  const body = await readJobJson(req);
  if (!body.ok) return body.response;
  const parsed = PatchBody.safeParse(body.value);
  if (!parsed.success) return validationErrorResponse(parsed.error);
  try {
    return successResponse(await updateSkill(id, skillId, user.id, parsed.data));
  } catch (error) {
    const res = jobErrorResponse(error);
    if (res) return res;
    throw error;
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id, skillId } = await params;
  try {
    await deleteSkill(id, skillId, user.id);
    return successResponse({ deleted: true });
  } catch (error) {
    const res = jobErrorResponse(error);
    if (res) return res;
    throw error;
  }
}
