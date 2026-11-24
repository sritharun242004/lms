import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAiConfigured } from "@/lib/ai/config";
import { prisma } from "@/lib/db/prisma";
import { loadSessionView } from "@/lib/prompt-bot/sessions";
import { NotConfigured } from "@/components/prompt-bot/not-configured";
import { Workspace } from "./workspace";

export default async function PromptBotSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { sessionId } = await params;
  const view = await loadSessionView(sessionId, user!.id);
  if (!view) notFound();
  if (!isAiConfigured()) return <NotConfigured isAdmin={user!.role === "ADMIN"} />;
  const taskMatrices = await prisma.promptMatrix.findMany({
    where: { kind: "TASK", isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return <Workspace initial={view} taskMatrices={taskMatrices} />;
}
