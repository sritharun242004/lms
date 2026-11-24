"use client";
import { Check, Copy, Loader2, Wand2 } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";

type Props = {
  content: string;
  streaming: boolean;
  version: number | null;
  versions: number[];
  onSelectVersion(version: number): void;
  error: string | null;
  onEnhance(): void;
  unansweredCount: number;
};

export function EnhancePanel({ content, streaming, version, versions, onSelectVersion, error, onEnhance, unansweredCount }: Props) {
  const [copied, setCopied] = React.useState(false);
  const copiedTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current); }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      return;
    }
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section className="glass rounded-[1.75rem] p-5" aria-labelledby="enhanced-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="enhanced-heading" className="font-semibold">Enhanced prompt{version ? ` · v${version}` : ""}</h2>
          {unansweredCount > 0 && !streaming && (
            <p className="text-xs text-muted-foreground">
              {unansweredCount} question{unansweredCount === 1 ? "" : "s"} not answered yet — the enhanced prompt will be higher-level.
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {versions.length > 1 && (
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              Version
              <select
                value={version ?? ""}
                disabled={streaming}
                onChange={(e) => onSelectVersion(Number(e.target.value))}
                className="rounded-xl border border-border bg-white/60 py-1.5 pl-3 pr-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50 dark:bg-white/5"
              >
                {versions.map((v) => (
                  <option key={v} value={v}>{`v${v}`}</option>
                ))}
              </select>
            </label>
          )}
          {content && !streaming && (
            <Button variant="outline" size="sm" onClick={copy}>
              {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              {copied ? "Copied" : "Copy"}
            </Button>
          )}
          <Button onClick={onEnhance} disabled={streaming}>
            {streaming ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Wand2 className="size-4" aria-hidden />}
            {streaming ? "Enhancing…" : content ? "Enhance again" : "Enhance"}
          </Button>
        </div>
      </div>
      <div aria-live="polite">
        {error && <p role="alert" className="mt-3 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        {content && (
          <pre
            tabIndex={0}
            aria-label="Enhanced prompt"
            className="mt-4 max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-2xl bg-white/60 p-4 font-sans text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 dark:bg-white/5"
          >
            {content}
          </pre>
        )}
      </div>
    </section>
  );
}
