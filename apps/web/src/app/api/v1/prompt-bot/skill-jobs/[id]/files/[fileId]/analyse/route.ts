import { after, NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { successResponse } from "@/lib/api/response";
import { AiNotConfiguredError, isAiConfigured } from "@/lib/ai/config";
import { aiErrorResponse } from "@/lib/prompt-bot/http";
import { runFileAnalysis, startReanalysis } from "@/lib/skills/jobs/files";
import { jobErrorResponse, unauthorized } from "@/lib/skills/jobs/http";

/** Analyse again: claims the file, answers 202, and analyses after the response (PDFs and images can be slow). */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (!isAiConfigured()) return aiErrorResponse(new AiNotConfiguredError());
  const { id, fileId } = await params;
  try {
    const view = await startReanalysis(id, fileId, user.id);
    after(() => runFileAnalysis(id, fileId, user.id));
    return successResponse(view, undefined, 202);
  } catch (error) {
    const res = jobErrorResponse(error);
    if (res) return res;
    throw error;
  }
}
