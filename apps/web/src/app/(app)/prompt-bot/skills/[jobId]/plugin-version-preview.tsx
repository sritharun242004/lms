"use client";
import * as React from "react";
import { ChevronDown, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPluginVersion } from "@/lib/skills/jobs/client";
import type { PluginVersionDetail, PluginView } from "@/lib/skills/jobs/types";
import { JOB_LIMITS } from "@/lib/skills/limits";
import { PluginFilesTabs } from "./plugin-files-tabs";
import { when } from "./version-when";

/** A version past the last pluginVersionsKept is deleted; the list on screen can still offer it until the page reloads. */
export const PLUGIN_VERSION_PRUNED_MESSAGE = `This version is no longer kept (only the last ${JOB_LIMITS.pluginVersionsKept} are kept).`;

type Props = { jobId: string; plugin: PluginView; children?: (version: number) => React.ReactNode };

/** The plugin's versions: pick one, preview its files. Versions never change, so loaded ones are kept. */
export function PluginVersionPreview({ jobId, plugin, children }: Props) {
  const newest = plugin.versions[0]?.version ?? plugin.latestVersion;
  const [seenLatest, setSeenLatest] = React.useState(plugin.latestVersion);
  const [selected, setSelected] = React.useState(newest);
  // A new version arriving (generation finished) moves the preview to it.
  if (seenLatest !== plugin.latestVersion) {
    setSeenLatest(plugin.latestVersion);
    setSelected(newest);
  }
  const [details, setDetails] = React.useState<Record<number, PluginVersionDetail>>({});
  const [failed, setFailed] = React.useState<{ version: number; pruned: boolean } | null>(null);
  const [attempt, setAttempt] = React.useState(0);
  const detail = details[selected] ?? null;

  React.useEffect(() => {
    if (details[selected]) return;
    let cancelled = false;
    void getPluginVersion(jobId, selected).then((result) => {
      if (cancelled) return;
      if (result.ok) setDetails((prev) => ({ ...prev, [selected]: result.data }));
      else setFailed({ version: selected, pruned: result.code === "NOT_FOUND" });
    });
    return () => {
      cancelled = true;
    };
  }, [jobId, selected, details, attempt]);

  return (
    <section aria-labelledby="plugin-versions-heading" className="glass rounded-[1.75rem] p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 id="plugin-versions-heading" className="text-base font-semibold">
            Versions
          </h3>
          <label htmlFor="plugin-version" className="mt-2 block text-xs font-medium text-muted-foreground">
            Plugin version
          </label>
          <span className="relative mt-1 inline-block">
            <select
              id="plugin-version"
              value={selected}
              onChange={(e) => setSelected(Number(e.target.value))}
              className="min-h-11 appearance-none rounded-xl border border-border bg-white/60 py-2 pl-3 pr-9 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 dark:bg-white/5 sm:min-h-9"
            >
              {plugin.versions.map((v) => (
                <option key={v.version} value={v.version}>
                  {`v${v.version} · ${when(v.createdAt)} · ${v.skills} skills`}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          </span>
        </div>
        {children?.(selected)}
      </div>

      <div className="mt-4 border-t border-border/60 pt-4">
        {detail ? (
          <>
            <p className="mb-3 font-mono text-xs text-muted-foreground">{detail.name}/</p>
            <PluginFilesTabs detail={detail} />
          </>
        ) : failed?.version === selected && failed.pruned ? (
          <p role="alert" className="py-6 text-center text-sm text-muted-foreground">
            {PLUGIN_VERSION_PRUNED_MESSAGE}
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
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
            Loading v{selected}…
          </p>
        )}
      </div>
    </section>
  );
}
