import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse, validationErrorResponse } from "@/lib/api/response";
import { AiNotConfiguredError, isAiConfigured } from "@/lib/ai/config";
import { splitWork } from "@/lib/ai/claude";
import { consumeAiUsage, LimitReachedError } from "@/lib/ai/usage";
import { aiErrorResponse } from "@/lib/prompt-bot/http";
import { titleFrom } from "@/lib/prompt-bot/sessions";
import { createPackFromSplit, loadPackView } from "@/lib/skills/packs";
import { cleanSplit, type SplitResult } from "@/lib/skills/split";

const CreateBody = z.object({
  description: z.string().trim().min(1).max(20000),
  role: z.string().trim().max(200).optional(),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  if (!isAiConfigured()) return aiErrorResponse(new AiNotConfiguredError());
  const parsed = CreateBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationErrorResponse(parsed.error);
  const { description } = parsed.data;
  const role = parsed.data.role || null;

  const catalog = await prisma.skillCatalogEntry.findMany({
    where: { isActive: true },
    select: { id: true, slug: true, name: true, description: true },
    orderBy: { name: "asc" },
  });
  // Spend the unit before the AI call; only a limit is an expected failure here, anything else is a real error.
  try {
    await consumeAiUsage(user.id, "skill_split");
  } catch (error) {
    if (error instanceof LimitReachedError) return aiErrorResponse(error);
    throw error;
  }
  let split: SplitResult;
  try {
    split = cleanSplit(await splitWork({ description, role, catalog }), new Set(catalog.map((c) => c.slug)));
  } catch (error) {
    return aiErrorResponse(error);
  }
  const id = await createPackFromSplit({ userId: user.id, title: titleFrom(description, "My skills"), description, role, split, catalog });
  return successResponse(await loadPackView(id, user.id), undefined, 201);
}
