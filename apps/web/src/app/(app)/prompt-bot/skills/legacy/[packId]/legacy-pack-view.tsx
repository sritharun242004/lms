"use client";
import * as React from "react";
import Link from "next/link";
import { Download, Info, Loader2, PackageOpen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SkillFilesView } from "@/components/prompt-bot/skills/skill-files-view";
import { downloadZip, getItem, skillPackUrl } from "@/lib/skills/client";
import type { SkillFile, SkillItemView, SkillPackView } from "@/lib/skills/types";
import { cn } from "@/lib/utils";

/** Only written custom skills have anything to show or download. */
const isWritten = (item: SkillItemView) => item.kind === "CUSTOM" && item.status === "READY" && (item.files?.length ?? 0) > 0;

export function LegacyPackView({ pack }: { pack: SkillPackView }) {
  const skills = React.useMemo(() => pack.items.filter(isWritten), [pack.items]);
  const [selectedId, setSelectedId] = React.useState<string | null>(skills[0]?.id ?? null);
  const [contents, setContents] = React.useState<Record<string, SkillFile[]>>({});
  const [failed, setFailed] = React.useState<string | null>(null);
  const [downloading, setDownloading] = React.useState<string | null>(null);
  const selected = skills.find((s) => s.id === selectedId) ?? null;

  React.useEffect(() => {
    if (!selectedId || contents[selectedId] || failed === selectedId) return;
    let cancelled = false;
    void getItem(pack.id, selectedId).then((result) => {
      if (cancelled) return;
      if (result.ok && result.data.files) {
        const files = result.data.files;
        setContents((prev) => ({ ...prev, [selectedId]: files }));
      } else setFailed(selectedId);
    });
    return () => {
      cancelled = true;
    };
  }, [pack.id, selectedId, contents, failed]);

  async function download(url: string) {
    if (downloading) return;
    setDownloading(url);
    const result = await downloadZip(url);
    setDownloading(null);
    if (!result.ok) toast.error(result.message);
  }

  const packZip = `${skillPackUrl(pack.id)}/download`;
  const skillZip = selected ? `${skillPackUrl(pack.id)}/items/${selected.id}/download` : null;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <header className="min-w-0">
        <h1 className="truncate text-2xl font-semibold tracking-tight" title={pack.title}>
          {pack.title}
        </h1>
        {pack.description && <p className="mt-1 line-clamp-3 max-w-3xl text-sm text-muted-foreground">{pack.description}</p>}
      </header>

      <p role="note" className="flex items-start gap-2 rounded-2xl bg-primary/5 px-4 py-3 text-sm dark:bg-primary/10">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <span>
          This pack was made with the earlier Skills Builder. It can&apos;t be changed.{" "}
          <Link
            href="/prompt-bot/skills"
            className="rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            Start a new job
          </Link>{" "}
          to build skills from your files.
        </span>
      </p>

      {skills.length === 0 ? (
        <p className="glass rounded-[1.75rem] p-8 text-center text-sm text-muted-foreground">
          No skills in this pack were written, so there is nothing to show or download.
        </p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <nav aria-label="Skills in this pack" className="glass h-fit rounded-[1.75rem] p-3">
            <ul className="flex flex-col gap-1">
              {skills.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    aria-pressed={s.id === selectedId}
                    onClick={() => setSelectedId(s.id)}
                    className={cn(
                      "flex min-h-11 w-full flex-col items-start rounded-xl px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                      s.id === selectedId ? "bg-primary/10 text-primary" : "hover:bg-white/60 dark:hover:bg-white/10",
                    )}
                  >
                    <span className="max-w-full truncate font-mono text-sm">{s.name}</span>
                    <span className="line-clamp-2 text-xs text-muted-foreground">{s.purpose}</span>
                  </button>
                </li>
              ))}
            </ul>
            <Button className="mt-3 w-full" size="lg" disabled={downloading !== null} onClick={() => void download(packZip)}>
              {downloading === packZip ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <PackageOpen className="size-4" aria-hidden />}
              Download pack
            </Button>
          </nav>

          {selected && skillZip && (
            <section className="glass min-w-0 rounded-[1.75rem] p-5" aria-labelledby="legacy-skill-heading">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 id="legacy-skill-heading" className="truncate font-mono text-lg font-semibold">
                    {selected.name}
                  </h2>
                  <p className="text-sm text-muted-foreground">{selected.purpose}</p>
                </div>
                <Button variant="outline" size="lg" disabled={downloading !== null} onClick={() => void download(skillZip)}>
                  {downloading === skillZip ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}
                  Download skill
                </Button>
              </div>
              <div className="mt-5">
                {contents[selected.id] ? (
                  <SkillFilesView files={contents[selected.id]} />
                ) : failed === selected.id ? (
                  <div role="alert" className="flex flex-col items-center gap-3 py-6 text-center text-sm">
                    <p>We couldn&apos;t load this skill&apos;s files. Check your connection and try again.</p>
                    <Button variant="outline" onClick={() => setFailed(null)}>
                      Try again
                    </Button>
                  </div>
                ) : (
                  <p role="status" className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Loading the files…
                  </p>
                )}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
