import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAiConfigured } from "@/lib/ai/config";
import { loadPackView } from "@/lib/skills/packs";
import { PackView } from "./pack-view";

export default async function SkillPackPage({ params }: { params: Promise<{ packId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return redirect("/login");
  const { packId } = await params;
  const view = await loadPackView(packId, user.id);
  if (!view) notFound();
  // Viewing, editing and downloading a pack need no AI; only scoring and generating do (PackView gates those).
  return <PackView initial={view} aiConfigured={isAiConfigured()} isAdmin={user.role === "ADMIN"} />;
}
