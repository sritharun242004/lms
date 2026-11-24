// apps/web/src/app/api/v1/prompt-bot/sessions/[id]/enhance/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse } from "@/lib/api/response";
import { AiNotConfiguredError, isAiConfigured } from "@/lib/ai/config";
import { streamEnhancement } from "@/lib/ai/claude";
import { consumeAiUsage } from "@/lib/ai/usage";
import { aiErrorResponse } from "@/lib/prompt-bot/http";
import { buildEnhanceMessage, INSTRUCTIONS_VERSION, type PromptQuestionContext } from "@/lib/prompt-bot/instructions";
import { unansweredQuestionIds } from "@/lib/prompt-bot/scoring";
import { loadSessionView } from "@/lib/prompt-bot/sessions";

export const maxDuration = 300;

const sse = (event: unknown) => `data: ${JSON.stringify(event)}\n\n`;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  const { id } = await params;
  const view = await loadSessionView(id, user.id);
  if (!view) return errorResponse("Session not found", "NOT_FOUND", 404);
  if (!isAiConfigured()) return aiErrorResponse(new AiNotConfiguredError());
  try {
    await consumeAiUsage(user.id, "enhance");
  } catch (error) {
    return aiErrorResponse(error);
  }

  const byId = new Map(view.answers.map((a) => [a.questionId, a]));
  const questions: PromptQuestionContext[] = view.matrices.flatMap((m) =>
    m.questions.map((q) => {
      const a = byId.get(q.id);
      return { id: q.id, text: q.text, guidance: q.guidance, answer: a?.answer ?? "", score: a?.score ?? 0, notRelevant: a?.notRelevant ?? false };
    }),
  );
  const gaps = unansweredQuestionIds(questions.map((q) => ({ questionId: q.id, score: q.score, notRelevant: q.notRelevant })));
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) => controller.enqueue(encoder.encode(sse(event)));
      let content = "";
      try {
        const { textStream, finalMessage } = streamEnhancement(buildEnhanceMessage(view.basePrompt, questions), req.signal);
        for await (const text of textStream) {
          content += text;
          send({ type: "delta", text });
        }
        const final = await finalMessage();
        if (!content.trim() || final.stopReason === "refusal") {
          send({ type: "error", message: "The AI declined or returned nothing for this prompt. Try rephrasing it." });
          return;
        }
        const latest = await prisma.promptBotEnhancement.findFirst({ where: { sessionId: id }, orderBy: { version: "desc" } });
        const version = (latest?.version ?? 0) + 1;
        await prisma.promptBotEnhancement.create({
          data: {
            sessionId: id,
            version,
            content: content.trim(),
            unansweredQuestionIds: gaps,
            model: final.model,
            instructionsVersion: INSTRUCTIONS_VERSION,
          },
        });
        send({ type: "done", version });
      } catch (error) {
        console.error("[prompt-bot] enhance failed:", error instanceof Error ? error.name : "unknown");
        send({ type: "error", message: "The AI couldn't finish your enhanced prompt. Please try again." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform" } });
}
