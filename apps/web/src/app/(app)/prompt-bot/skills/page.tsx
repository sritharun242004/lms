import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock3, Library } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { isAiConfigured } from "@/lib/ai/config";
import { prisma } from "@/lib/db/prisma";
import { canEditMatrices } from "@/lib/prompt-bot/matrix-input";
import { NotConfigured } from "@/components/prompt-bot/not-configured";
import { NewPackForm } from "./new-pack-form";

export default async function SkillsBuilderPage() {
  const user = await getCurrentUser();
  if (!user) return redirect("/login");
  const packs = await prisma.skillPack.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    take: 20,
    select: { id: true, title: true, updatedAt: true, items: { select: { kind: true, status: true } } },
  });
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Skills Builder</h1>
        <p className="mt-2 text-muted-foreground">
          Turn a task or your day-to-day work into reusable AI skills for Claude, Cursor, Codex and other tools.
        </p>
      </header>
      {canEditMatrices(user.role) && (
        <div className="flex justify-center">
          <Link
            href="/prompt-bot/catalog"
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <Library className="size-4" aria-hidden /> Manage skill catalog
          </Link>
        </div>
      )}
      {isAiConfigured() ? <NewPackForm /> : <NotConfigured isAdmin={user.role === "ADMIN"} />}
      {packs.length > 0 && (
        <section className="glass rounded-[1.75rem] p-5" aria-labelledby="your-packs">
          <h2 id="your-packs" className="text-sm font-medium text-muted-foreground">Your skill packs</h2>
          <ul className="mt-3 divide-y divide-border/60">
            {packs.map((pack) => {
              const custom = pack.items.filter((i) => i.kind === "CUSTOM");
              const ready = custom.filter((i) => i.status === "READY").length;
              return (
                <li key={pack.id}>
                  <Link
                    href={`/prompt-bot/skills/${pack.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-white/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 dark:hover:bg-white/5"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{pack.title}</span>
                      <span className="block text-xs text-muted-foreground">
                        {custom.length} {custom.length === 1 ? "skill" : "skills"} · {ready} ready
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                      <Clock3 className="size-3.5" aria-hidden />
                      {pack.updatedAt.toLocaleDateString()}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <p className="text-center text-xs text-muted-foreground">
        Your descriptions and answers are stored in the LMS and sent to Anthropic&apos;s API to build your skills.
      </p>
    </div>
  );
}
