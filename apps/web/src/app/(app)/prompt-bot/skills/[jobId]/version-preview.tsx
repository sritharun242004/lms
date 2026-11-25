"use client";
import * as React from "react";
import { ChevronDown, Download, Loader2, PackageOpen, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SkillFilesView } from "@/components/prompt-bot/skills/skill-files-view";
import { downloadZip } from "@/lib/skills/client";
import { getVersion, versionDownloadUrl } from "@/lib/skills/jobs/client";
import type { JobSkillView, VersionDetail } from "@/lib/skills/jobs/types";
import { JOB_LIMITS } from "@/lib/skills/limits";
import { when } from "./version-when";

/** A version past the last versionsKept is deleted; the list on screen can still offer it until the page reloads. */
export const VERSION_PRUNED_MESSAGE = `This version is no longer kept (only the last ${JOB_LIMITS.versionsKept} are kept).`;

/** Read-only preview and downloads of one version of a skill. Versions never change, so loaded ones are kept. */
export function VersionPreview({ jobId, skill }: { jobId: string; skill: JobSkillView }) {
  const newest = skill.versions[0]?.version ?? skill.latestVersion;
  const [seenLatest, setSeenLatest] = React.useState(skill.latestVersion);
  const [selected, setSelected] = React.useState(newest);
  // A new version arriving (generation finished) moves the preview to it.
  if (seenLatest !== skill.latestVersion) {
    setSeenLatest(skill.latestVersion);
    setSelected(newest);
  }
  const [details, setDetails] = React.useState<Record<number, VersionDetail>>({});
  const [failed, setFailed] = React.useState<{ version: number; pruned: boolean } | null>(null);
  const [attempt, setAttempt] = React.useState(0);
  const [downloading, setDownloading] = React.useState<"upload" | "pack" | null>(null);
  const detail = details[selected] ?? null;
  const selectId = `version-${skill.id}`;

  React.useEffect(() => {
    if (details[selected]) return;
    let cancelled = false;
    void getVersion(jobId, skill.id, selected).then((result) => {
      if (cancelled) return;
      if (result.ok) setDetails((prev) => ({ ...prev, [selected]: result.data }));
      else setFailed({ version: selected, pruned: result.code === "NOT_FOUND" });
    });
    return () => {
      cancelled = true;
    };
  }, [jobId, skill.id, selected, details, attempt]);

  async function download(format: "upload" | "pack") {
    setDownloading(format);
    const result = await downloadZip(versionDownloadUrl(jobId, skill.id, selected, format));
    setDownloading(null);
    if (!result.ok) toast.error(result.message);
  }

  return (
    <div className="mt-5 border-t border-border/60 pt-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <label htmlFor={selectId} className="block text-xs font-medium text-muted-foreground">
            Version<span className="sr-only">: {skill.name}</span>
          </label>
          <span className="relative mt-1 inline-block">
            <select
              id={selectId}
              value={selected}
              onChange={(e) => setSelected(Number(e.target.value))}
              className="min-h-11 appearance-none rounded-xl border border-border bg-white/60 py-2 pl-3 pr-9 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 dark:bg-white/5 sm:min-h-9"
            >
              {skill.versions.map((v) => (
                <option key={v.version} value={v.version}>
                  {`v${v.version} · ${when(v.createdAt)}`}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="lg" disabled={downloading !== null} onClick={() => void download("upload")}>
            {downloading === "upload" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}
            Download for Claude<span className="sr-only">: {skill.name}</span>
          </Button>
          <Button variant="outline" size="lg" disabled={downloading !== null} onClick={() => void download("pack")}>
            {downloading === "pack" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <PackageOpen className="size-4" aria-hidden />}
            Download to share<span className="sr-only">: {skill.name}</span>
          </Button>
        </div>
      </div>
      <section aria-label="How to use this skill" className="mt-3 rounded-2xl bg-primary/5 px-4 py-3 ring-1 ring-primary/15 dark:bg-primary/10">
        <h3 className="text-sm font-semibold">How to use this skill</h3>
        <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-sm text-muted-foreground marker:font-medium marker:text-primary">
          <li>
            In Claude, open Settings → Capabilities and turn on <span className="font-medium text-foreground">Create and edit files</span>.
          </li>
          <li>
            Go to Plugins → Add → <span className="font-medium text-foreground">Upload plugin</span> and pick the zip from Download for Claude.
          </li>
          <li>Then just ask in your own words. Claude uses the skill automatically.</li>
        </ol>
        <p className="mt-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">To share:</span> readable files, a README and the Claude zip.{" "}
          {`We keep the last ${JOB_LIMITS.versionsKept} versions of each skill.`}
        </p>
      </section>

      <div className="mt-4">
        {detail ? (
          <>
            <p className="mb-3 font-mono text-xs text-muted-foreground">{detail.name}/</p>
            <SkillFilesView files={detail.files} assets={detail.assets} />
          </>
        ) : failed?.version === selected && failed.pruned ? (
          <p role="alert" className="py-6 text-center text-sm text-muted-foreground">
            {VERSION_PRUNED_MESSAGE}
          </p>
        ) : failed?.version === selected ? (
          <div role="alert" className="flex flex-col items-center gap-3 py-6 text-center text-sm">
            <p>We couldn&apos;t load this version. Check your connection.</p>
            <Button
              variant="outline"
              size="sm"
              className="min-h-11 sm:min-h-8"
              onClick={() => {
                setFailed(null);
                setAttempt((a) => a + 1);
              }}
            >
              <RotateCcw className="size-4" aria-hidden />
              Load again
            </Button>
          </div>
        ) : (
          <p role="status" className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading v{selected}…
          </p>
        )}
      </div>
    </div>
  );
}
