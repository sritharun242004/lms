import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { successResponse, validationErrorResponse } from "@/lib/api/response";
import { AnswerBody, answerFields } from "@/lib/prompt-bot/answer-input";
import { jobErrorResponse, notFound, readJobJson, unauthorized } from "@/lib/skills/jobs/http";
import { saveJobAnswer } from "@/lib/skills/jobs/jobs";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; questionId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id, questionId } = await params;
  const body = await readJobJson(req);
  if (!body.ok) return body.response;
  const parsed = AnswerBody.safeParse(body.value);
  if (!parsed.success) return validationErrorResponse(parsed.error);
  try {
    const result = await saveJobAnswer(id, user.id, questionId, answerFields(parsed.data));
    return result === "saved" ? successResponse({ saved: true }) : notFound("Question");
  } catch (error) {
    const res = jobErrorResponse(error);
    if (res) return res;
    throw error;
  }
}
