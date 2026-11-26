import { after, NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { successResponse } from "@/lib/api/response";
import { AiNotConfiguredError, isAiConfigured } from "@/lib/ai/config";
import { aiErrorResponse } from "@/lib/prompt-bot/http";
import { runFileAnalysis } from "@/lib/skills/jobs/files";
import { jobErrorResponse, unauthorized } from "@/lib/skills/jobs/http";
import { completeJobFileUpload } from "@/lib/skills/jobs/uploads";

/** Step three, after the browser's PUT to S3: checks and stores the file (201), then analyses it after the response. */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (!isAiConfigured()) return aiErrorResponse(new AiNotConfiguredError());
  const { id, fileId } = await params;
  try {
    const { view, created } = await completeJobFileUpload(id, fileId, user.id);
    if (created) after(() => runFileAnalysis(id, fileId, user.id));
    return successResponse(view, undefined, created ? 201 : 200);
  } catch (error) {
    const res = jobErrorResponse(error);
    if (res) return res;
    throw error;
  }
}
