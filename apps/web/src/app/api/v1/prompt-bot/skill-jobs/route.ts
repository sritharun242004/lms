import { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { successResponse, validationErrorResponse } from "@/lib/api/response";
import { readJobJson, unauthorized } from "@/lib/skills/jobs/http";
import { createJob, loadJobView } from "@/lib/skills/jobs/jobs";
import { JOB_LIMITS } from "@/lib/skills/limits";

const CreateBody = z.object({
  title: z.string().trim().min(1).max(JOB_LIMITS.titleChars).optional(),
  description: z.string().max(JOB_LIMITS.descriptionChars).optional(),
});

/** Starts a job. Needs no AI: the page shows NotConfigured for the AI steps when the key is missing. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const body = await readJobJson(req);
  if (!body.ok) return body.response;
  const parsed = CreateBody.safeParse(body.value);
  if (!parsed.success) return validationErrorResponse(parsed.error);
  const id = await createJob(user.id, parsed.data);
  return successResponse(await loadJobView(id, user.id), undefined, 201);
}
