import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { canEditMatrices } from "@/lib/prompt-bot/matrix-input";
import { toCatalogEntryView } from "@/lib/skills/catalog-input";
import { CatalogEditor } from "./catalog-editor";

export default async function SkillCatalogPage() {
  const user = await getCurrentUser();
  if (!user) return redirect("/login");
  if (!canEditMatrices(user.role)) return redirect("/prompt-bot/skills");
  const rows = await prisma.skillCatalogEntry.findMany({ orderBy: { name: "asc" } });
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Skill catalog</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Public skills the Skills Builder can recommend. Packs list them with a link to their source.
        </p>
      </header>
      <CatalogEditor initial={rows.map(toCatalogEntryView)} />
    </div>
  );
}
