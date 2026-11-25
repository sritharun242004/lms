import Link from "next/link";
import { redirect } from "next/navigation";
import { Archive, ChevronRight, Clock3 } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { isAiConfigured } from "@/lib/ai/config";
import { prisma } from "@/lib/db/prisma";
import { Badge } from "@/components/ui/badge";
import { NotConfigured } from "@/components/prompt-bot/not-configured";
import { NewJobForm } from "./new-job-form";

/** Rows shown at first, and with Show all: a safe bound, not pagination; a user with more sees a note. */
const LIST_SIZE = 20;
const ALL_LIST_SIZE = 200;
const SHOW_ALL = "/prompt-bot/skills?all=1";
const MORE_LINK =
  "inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 sm:min-h-9";
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const ROW =
  "flex min-h-11 items-center justify-between gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-white/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 dark:hover:bg-white/5";

/** One more row than shown tells whether more exist. */
function trim<T>(rows: T[], size: number) {
  return { rows: rows.slice(0, size), more: rows.length > size };
}

function ListEnd({ more, showAll, href, noun }: { more: boolean; showAll: boolean; href: string; noun: string }) {
  if (!more) return null;
  if (showAll) return <p className="mb-3 mt-3 px-2 text-xs text-muted-foreground">{`Showing your ${ALL_LIST_SIZE} most recent ${noun}.`}</p>;
  return (
    <div className="mb-2 mt-2">
      <Link href={href} className={MORE_LINK}>
        {`Show all ${noun}`}
      </Link>
    </div>
  );
}

export default async function SkillsBuilderPage({ searchParams }: { searchParams: Promise<{ all?: string | string[] }> }) {
  const user = await getCurrentUser();
  if (!user) return redirect("/login");
  const showAll = (await searchParams).all === "1";
  const size = showAll ? ALL_LIST_SIZE : LIST_SIZE;
  const [jobRows, packRows] = await Promise.all([
    prisma.skillJob.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      take: size + 1,
      select: { id: true, title: true, updatedAt: true, _count: { select: { skills: true, files: { where: { deletedAt: null } } } } },
    }),
    prisma.skillPack.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      take: size + 1,
      select: { id: true, title: true, updatedAt: true },
    }),
  ]);
  const jobs = trim(jobRows, size);
  const packs = trim(packRows, size);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-balance">Skills Builder</h1>
        <p className="mt-2 text-pretty text-muted-foreground">
          Turn a job you do every week into your own Agent Skills, built from your own files and templates.
        </p>
      </header>

      {isAiConfigured() ? (
        <NewJobForm draftKey={`skills-builder:job-draft:${user.id}`} />
      ) : (
        <NotConfigured isAdmin={user.role === "ADMIN"} />
      )}

      {jobs.rows.length > 0 && (
        <section className="glass rounded-[1.75rem] p-5" aria-labelledby="your-jobs">
          <h2 id="your-jobs" className="text-sm font-medium text-muted-foreground">
            Your jobs
          </h2>
          <ul className="mt-3 divide-y divide-border/60">
            {jobs.rows.map((job) => (
              <li key={job.id}>
                <Link href={`/prompt-bot/skills/${job.id}`} className={ROW}>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{job.title}</span>
                    <span className="block text-xs tabular-nums text-muted-foreground">
                      {plural(job._count.skills, "skill")} · {plural(job._count.files, "file")}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground">
                    <Clock3 className="size-3.5" aria-hidden />
                    {job.updatedAt.toLocaleDateString()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <ListEnd more={jobs.more} showAll={showAll} href={SHOW_ALL} noun="jobs" />
        </section>
      )}

      {packs.rows.length > 0 && (
        <details id="earlier-packs" open={showAll || undefined} className="group rounded-[1.75rem] bg-white/35 px-5 py-2 dark:bg-white/[0.03]">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 [&::-webkit-details-marker]:hidden">
            <ChevronRight
              className="size-4 transition-transform duration-200 ease-out group-open:rotate-90 motion-reduce:transition-none"
              aria-hidden
            />
            <Archive className="size-4" aria-hidden />
            Earlier skill packs
            <Badge variant="outline" className="ml-1">
              Read-only
            </Badge>
          </summary>
          <ul className={`mt-1 divide-y divide-border/60 ${packs.more ? "" : "mb-3"}`}>
            {packs.rows.map((pack) => (
              <li key={pack.id}>
                <Link href={`/prompt-bot/skills/legacy/${pack.id}`} className={ROW}>
                  <span className="min-w-0 truncate">{pack.title}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{pack.updatedAt.toLocaleDateString()}</span>
                </Link>
              </li>
            ))}
          </ul>
          <ListEnd more={packs.more} showAll={showAll} href={`${SHOW_ALL}#earlier-packs`} noun="packs" />
        </details>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Your job, files and answers are stored in the LMS and sent to Anthropic&apos;s API to build your skills.
      </p>
    </div>
  );
}
