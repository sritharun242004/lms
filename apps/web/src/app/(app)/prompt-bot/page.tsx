import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Clock3, ListChecks } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { isAiConfigured } from "@/lib/ai/config";
import { canEditMatrices } from "@/lib/prompt-bot/matrix-input";
import { splitRecent, updatedLabel } from "@/lib/prompt-bot/recent";
import { recentSessions, type RecentSession } from "@/lib/prompt-bot/sessions";
import { NotConfigured } from "@/components/prompt-bot/not-configured";
import { StartForm } from "./start-form";

function ContinueCard({ session }: { session: RecentSession }) {
  return (
    <Link
      href={`/prompt-bot/${session.id}`}
      className="glass group flex items-center gap-4 rounded-[1.75rem] p-5 transition-transform duration-200 ease-out hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-semibold">
          <span className="text-primary">Continue:</span> {session.title}
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted dark:bg-white/10" aria-hidden>
              <span
                className="block h-full origin-left rounded-full bg-primary"
                style={{ transform: `scaleX(${session.relevant ? session.answered / session.relevant : 0})` }}
              />
            </span>
            <span className="tabular-nums">
              {session.answered} of {session.relevant} ready
            </span>
          </span>
          <span>{updatedLabel(session.updatedAt)}</span>
        </span>
      </span>
      <ArrowRight
        className="size-5 shrink-0 text-primary transition-transform duration-200 ease-out group-hover:translate-x-0.5 motion-reduce:transition-none"
        aria-hidden
      />
    </Link>
  );
}

export default async function PromptBotPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { resume, others } = splitRecent(await recentSessions(user!.id, 8));
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
      {resume && <ContinueCard session={resume} />}
      {isAiConfigured() ? (
        <StartForm draftKey={`prompt-bot:start-draft:${user!.id}`} />
      ) : (
        <NotConfigured isAdmin={user!.role === "ADMIN"} />
      )}
      {others.length > 0 && (
        <section className="glass rounded-[1.75rem] p-5" aria-labelledby="recent-prompts">
          <h2 id="recent-prompts" className="text-sm font-medium text-muted-foreground">
            {resume ? "Earlier prompts" : "Recent prompts"}
          </h2>
          <ul className="mt-3 divide-y divide-border/60">
            {others.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/prompt-bot/${s.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-white/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 dark:hover:bg-white/5"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{s.title}</span>
                    <span className="block text-xs tabular-nums text-muted-foreground">
                      {s.answered} of {s.relevant} ready
                    </span>
                  </span>
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
