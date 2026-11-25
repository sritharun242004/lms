import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { successResponse, validationErrorResponse } from "@/lib/api/response";
import { jobErrorResponse, readJobJson, unauthorized } from "@/lib/skills/jobs/http";
import { QuestionBody } from "@/lib/skills/jobs/question-input";
import { addQuestion } from "@/lib/skills/jobs/task-questions";

/** Adds the person's own question ("Answer now") or per-use input ("Asked each time you use it"). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const body = await readJobJson(req);
  if (!body.ok) return body.response;
  const parsed = QuestionBody.safeParse(body.value);
  if (!parsed.success) return validationErrorResponse(parsed.error);
  try {
    return successResponse(await addQuestion(id, user.id, parsed.data), undefined, 201);
  } catch (error) {
    const res = jobErrorResponse(error);
    if (res) return res;
    throw error;
  }
}
