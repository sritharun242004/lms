import type { NextRequest } from "next/server";
import { submitPublicFormResponse } from "@/lib/forms/responses";
import { FormError } from "@/lib/forms/form-service";
import { errorResponse, successResponse } from "@/lib/api/response";
import { RATE_LIMITS, clientIp, hitRateLimit, tooManyAttempts } from "@/lib/api/rate-limit";
import { HONEYPOT_FIELD } from "@/lib/forms/public-link";

function isAnswerList(value: unknown): value is { questionId: string; value: unknown }[] {
  return (
    Array.isArray(value) &&
    value.every((a) => typeof a === "object" && a !== null && typeof (a as { questionId?: unknown }).questionId === "string")
  );
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const retryAfter = hitRateLimit(`public-form:${clientIp(req)}`, RATE_LIMITS.publicFormSubmitPerIp);
  if (retryAfter !== null) return tooManyAttempts(retryAfter);

  let body: { answers?: unknown; [HONEYPOT_FIELD]?: unknown };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid request body", "PARSE_ERROR", 400);
  }
  if (typeof body[HONEYPOT_FIELD] === "string" && body[HONEYPOT_FIELD] !== "") {
    // Look successful so the bot has no signal to adapt to; nothing is saved.
    return successResponse({ submitted: true }, undefined, 201);
  }
  if (!isAnswerList(body.answers)) {
    return errorResponse("Answers are required", "VALIDATION_ERROR", 400);
  }

  const { id } = await params;
  try {
    await submitPublicFormResponse(id, body.answers);
    return successResponse({ submitted: true }, undefined, 201);
  } catch (error) {
    if (error instanceof FormError) return errorResponse(error.message, error.code, error.status);
    throw error;
  }
}
