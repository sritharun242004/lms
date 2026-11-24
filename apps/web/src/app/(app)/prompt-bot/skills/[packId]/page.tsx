import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAiConfigured } from "@/lib/ai/config";
import { loadPackView } from "@/lib/skills/packs";
import { NotConfigured } from "@/components/prompt-bot/not-configured";
import { PackView } from "./pack-view";

export default async function SkillPackPage({ params }: { params: Promise<{ packId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return redirect("/login");
  const { packId } = await params;
  const view = await loadPackView(packId, user.id);
  if (!view) notFound();
  if (!isAiConfigured()) return <NotConfigured isAdmin={user.role === "ADMIN"} />;
  return <PackView initial={view} />;
}
