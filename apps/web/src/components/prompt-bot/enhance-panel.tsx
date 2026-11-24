"use client";
import { Check, Copy, Loader2, Wand2 } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";

type Props = {
  content: string;
  streaming: boolean;
  version: number | null;
  error: string | null;
  onEnhance(): void;
  unansweredCount: number;
};

export function EnhancePanel({ content, streaming, version, error, onEnhance, unansweredCount }: Props) {
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
