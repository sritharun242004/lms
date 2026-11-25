import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock3 } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export default async function SkillsBuilderPage() {
  const user = await getCurrentUser();
  if (!user) return redirect("/login");
  const packs = await prisma.skillPack.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    take: 20,
    select: { id: true, title: true, updatedAt: true },
  });
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Skills Builder</h1>
        <p className="mt-2 text-muted-foreground">Turn a job you do every week into your own Agent Skills, built from your own files and templates.</p>
      </header>
      {packs.length > 0 && (
        <section className="glass rounded-[1.75rem] p-5" aria-labelledby="earlier-packs">
          <h2 id="earlier-packs" className="text-sm font-medium text-muted-foreground">Earlier skill packs</h2>
          <ul className="mt-3 divide-y divide-border/60">
            {packs.map((pack) => (
              <li key={pack.id}>
                <Link
                  href={`/prompt-bot/skills/legacy/${pack.id}`}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-white/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 dark:hover:bg-white/5"
                >
                  <span className="min-w-0 truncate font-medium">{pack.title}</span>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full bg-muted px-2 py-0.5 dark:bg-white/10">Read-only</span>
                    <Clock3 className="size-3.5" aria-hidden />
                    {pack.updatedAt.toLocaleDateString()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
