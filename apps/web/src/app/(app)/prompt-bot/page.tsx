import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock3, ListChecks } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { isAiConfigured } from "@/lib/ai/config";
import { prisma } from "@/lib/db/prisma";
import { canEditMatrices } from "@/lib/prompt-bot/matrix-input";
import { NotConfigured } from "@/components/prompt-bot/not-configured";
import { StartForm } from "./start-form";

export default async function PromptBotPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const recent = await prisma.promptBotSession.findMany({
    where: { userId: user!.id },
    orderBy: { updatedAt: "desc" },
    take: 8,
    select: { id: true, title: true, updatedAt: true },
  });
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Prompt Bot</h1>
        <p className="mt-2 text-muted-foreground">
          Using a structured approach, the quality, certainty and consistency of AI is massively increased.
        </p>
      </header>
      {canEditMatrices(user!.role) && (
        <div className="flex justify-center">
          <Link
            href="/prompt-bot/matrices"
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <ListChecks className="size-4" aria-hidden /> Manage questions
          </Link>
        </div>
      )}
      {isAiConfigured() ? <StartForm /> : <NotConfigured isAdmin={user!.role === "ADMIN"} />}
      {recent.length > 0 && (
        <section className="glass rounded-[1.75rem] p-5" aria-labelledby="recent-prompts">
          <h2 id="recent-prompts" className="text-sm font-medium text-muted-foreground">Recent prompts</h2>
          <ul className="mt-3 divide-y divide-border/60">
            {recent.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/prompt-bot/${s.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-white/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 dark:hover:bg-white/5"
                >
                  <span className="truncate font-medium">{s.title}</span>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                    <Clock3 className="size-3.5" aria-hidden />
                    {s.updatedAt.toLocaleDateString()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-center text-xs text-muted-foreground">
        Your prompts are stored in the LMS and sent to Anthropic&apos;s API to analyse them.
      </p>
    </div>
  );
}
