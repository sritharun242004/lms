import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { loadPackView } from "@/lib/skills/packs";
import { LegacyPackView } from "./legacy-pack-view";

/** A pack from the earlier Skills Builder: viewable and downloadable, never changed. Needs no AI. */
export default async function LegacyPackPage({ params }: { params: Promise<{ packId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return redirect("/login");
  const { packId } = await params;
  const pack = await loadPackView(packId, user.id);
  if (!pack) notFound();
  return <LegacyPackView pack={pack} />;
}
