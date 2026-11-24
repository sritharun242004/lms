// apps/web/src/app/api/v1/prompt-bot/settings/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse } from "@/lib/api/response";
import { getLimits, normalizeLimits } from "@/lib/ai/usage";

async function admin() {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  if (user.role !== "ADMIN") return errorResponse("Only admins can change AI limits", "FORBIDDEN", 403);
  return null;
}

export async function GET() {
  const denied = await admin();
  if (denied) return denied;
  return successResponse(await getLimits());
}

export async function PATCH(req: NextRequest) {
  const denied = await admin();
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const current = await prisma.aiSettings.findUnique({ where: { id: "singleton" } });
  const limits = normalizeLimits({ ...normalizeLimits(current?.limits), ...body });
  await prisma.aiSettings.upsert({ where: { id: "singleton" }, create: { id: "singleton", limits }, update: { limits } });
  return successResponse(limits);
}
