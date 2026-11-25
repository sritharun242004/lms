"use client";
import * as React from "react";
import { Download, Loader2, PackageOpen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { downloadZip } from "@/lib/skills/client";
import { pluginDownloadUrl } from "@/lib/skills/jobs/client";
import { JOB_LIMITS } from "@/lib/skills/limits";
import { chatPhrase, slashCommand } from "./how-to-call";

type Format = "plugin" | "share";

/** The selected version's two downloads: the plugin zip Claude uploads, and a readable pack to share. */
export function PluginDownloads({ jobId, version }: { jobId: string; version: number }) {
  const [downloading, setDownloading] = React.useState<Format | null>(null);

  async function download(format: Format) {
    setDownloading(format);
    const result = await downloadZip(pluginDownloadUrl(jobId, version, format));
    setDownloading(null);
    if (!result.ok) toast.error(result.message);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="lg" disabled={downloading !== null} aria-busy={downloading === "plugin" || undefined} onClick={() => void download("plugin")}>
        {downloading === "plugin" ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Download className="size-4" aria-hidden />}
        Download for Claude<span className="sr-only">{`, plugin v${version}`}</span>
      </Button>
      <Button variant="outline" size="lg" disabled={downloading !== null} aria-busy={downloading === "share" || undefined} onClick={() => void download("share")}>
        {downloading === "share" ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <PackageOpen className="size-4" aria-hidden />}
        Download to share<span className="sr-only">{`, plugin v${version}`}</span>
      </Button>
    </div>
  );
}

/** Upload, then call: one example sub-skill by name in chat, and its plugin command in Claude Code or Cowork. */
export function HowToUsePlugin({ plugin, example }: { plugin: string; example: string }) {
  const strong = "font-medium text-foreground";
  return (
    <section aria-labelledby="plugin-how-to-use" className="rounded-2xl bg-primary/5 px-4 py-3 ring-1 ring-primary/15 dark:bg-primary/10">
      <h3 id="plugin-how-to-use" className="text-sm font-semibold">
        How to use this plugin
      </h3>
      <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-sm text-pretty text-muted-foreground marker:font-medium marker:text-primary">
        <li>
          In Claude, open Settings → Capabilities and turn on <span className={strong}>Create and edit files</span>.
        </li>
        <li>
          Then go to Plugins → Add → <span className={strong}>Upload plugin</span> and choose the zip from Download for Claude.
        </li>
        <li>
          In chat, ask for a sub-skill by name (<span className={strong}>{`“${chatPhrase("SUB", example).replace(/…$/, "")}”`}</span>), or just ask for the whole job.
        </li>
        <li>
          In Claude Code or Cowork, type <code className="rounded bg-black/5 px-1 font-mono text-[0.8125rem] break-all text-foreground dark:bg-white/10">{slashCommand(plugin, example)}</code>.
        </li>
      </ol>
      <p className="mt-2 text-xs text-pretty text-muted-foreground">
        <span className={strong}>To share:</span> readable files, a README and the plugin zip.{" "}
        {`We keep the last ${JOB_LIMITS.pluginVersionsKept} versions of this plugin.`}
      </p>
    </section>
  );
}
