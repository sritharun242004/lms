import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAiConfigured } from "@/lib/ai/config";
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
  return <Workspace initial={view} />;
}
