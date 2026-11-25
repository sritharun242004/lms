import { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { successResponse, validationErrorResponse } from "@/lib/api/response";
import { jobErrorResponse, notFound, readJobJson, unauthorized } from "@/lib/skills/jobs/http";
import { deleteJob, loadJobView, updateJob } from "@/lib/skills/jobs/jobs";
import { JOB_LIMITS } from "@/lib/skills/limits";

type Ctx = { params: Promise<{ id: string }> };
const PatchBody = z
  .object({
    title: z.string().trim().min(1).max(JOB_LIMITS.titleChars).optional(),
    description: z.string().max(JOB_LIMITS.descriptionChars).optional(),
  })
  .refine((v) => v.title !== undefined || v.description !== undefined, "Nothing to update");

export async function GET(_req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const view = await loadJobView(id, user.id);
  return view ? successResponse(view) : notFound("Job");
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const body = await readJobJson(req);
  if (!body.ok) return body.response;
  const parsed = PatchBody.safeParse(body.value);
  if (!parsed.success) return validationErrorResponse(parsed.error);
  try {
    return successResponse(await updateJob(id, user.id, parsed.data));
  } catch (error) {
    const res = jobErrorResponse(error);
    if (res) return res;
    throw error;
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await params;
  try {
    await deleteJob(id, user.id);
    return successResponse({ deleted: true });
  } catch (error) {
    const res = jobErrorResponse(error);
    if (res) return res;
    throw error;
  }
}
