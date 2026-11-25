import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { successResponse, validationErrorResponse } from "@/lib/api/response";
import { jobErrorResponse, readJobJson, unauthorized } from "@/lib/skills/jobs/http";
import { QuestionPatch } from "@/lib/skills/jobs/question-input";
import { deleteQuestion, updateQuestion } from "@/lib/skills/jobs/task-questions";

type Ctx = { params: Promise<{ id: string; questionId: string }> };

function mapped(error: unknown): Response {
  const res = jobErrorResponse(error);
  if (res) return res;
  throw error;
}

/** Edits a question; `kind` moves it between "Answer now" and "Asked each time you use it". */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id, questionId } = await params;
  const body = await readJobJson(req);
  if (!body.ok) return body.response;
  const parsed = QuestionPatch.safeParse(body.value);
  if (!parsed.success) return validationErrorResponse(parsed.error);
  try {
    return successResponse(await updateQuestion(id, user.id, questionId, parsed.data));
  } catch (error) {
    return mapped(error);
  }
}

/** Deletes a question and its answer; its files become general files. */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id, questionId } = await params;
  try {
    await deleteQuestion(id, user.id, questionId);
    return successResponse({ deleted: true });
  } catch (error) {
    return mapped(error);
  }
}
