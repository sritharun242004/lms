import { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { successResponse, validationErrorResponse } from "@/lib/api/response";
import { jobErrorResponse, readJobJson, unauthorized } from "@/lib/skills/jobs/http";
import { addSkill } from "@/lib/skills/jobs/skills";
import { JOB_LIMITS } from "@/lib/skills/limits";

const Body = z.object({
  name: z.string().trim().min(1).max(JOB_LIMITS.skillNameChars),
  purpose: z.string().trim().min(1).max(JOB_LIMITS.skillPurposeChars),
  fileIds: z.array(z.string().min(1).max(64)).max(JOB_LIMITS.fileIdsPerSkill).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const body = await readJobJson(req);
  if (!body.ok) return body.response;
  const parsed = Body.safeParse(body.value);
  if (!parsed.success) return validationErrorResponse(parsed.error);
  try {
    return successResponse(await addSkill(id, user.id, parsed.data), undefined, 201);
  } catch (error) {
    const res = jobErrorResponse(error);
    if (res) return res;
    throw error;
  }
}
