"use client";
import { Check, Copy, Loader2, Wand2 } from "lucide-react";
import * as React from "react";
import type { Components } from "react-markdown";
import { Button } from "@/components/ui/button";
import { SafeMarkdown } from "./safe-markdown";

type Props = {
  content: string;
  /** Changes when a different prompt replaces the shown one (new run, version switch), to fade it in. */
  contentKey: number;
  streaming: boolean;
  version: number | null;
  versions: number[];
  onSelectVersion(version: number): void;
  error: string | null;
  onEnhance(): void;
  unansweredCount: number;
};

/** The prompt's sections sit under the panel's h2, so Markdown headings render one level down. */
const SECTION_HEADINGS: Components = {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- `node` is react-markdown's AST node, not a DOM prop.
  h1: ({ node, ...props }) => <h3 {...props} />,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- as above
  h2: ({ node, ...props }) => <h3 {...props} />,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- as above
  h3: ({ node, ...props }) => <h4 {...props} />,
};

const PROMPT_TYPE = [
  "max-w-[72ch] text-sm leading-relaxed text-foreground/90",
  "[&_h3]:mt-5 [&_h3]:border-t [&_h3]:border-border/70 [&_h3]:pt-4 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-foreground",
  "[&_h3:first-child]:mt-0 [&_h3:first-child]:border-t-0 [&_h3:first-child]:pt-0",
  "[&_h4]:mt-3 [&_h4]:font-semibold [&_h4]:text-foreground",
  "[&_p]:mt-1.5 [&_ul]:mt-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mt-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mt-1 [&_li]:pl-0.5",
  "[&_strong]:font-semibold [&_strong]:text-foreground [&_blockquote]:mt-2 [&_blockquote]:border-l [&_blockquote]:border-border [&_blockquote]:pl-3",
  "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 dark:[&_a]:text-brand-400",
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs dark:[&_code]:bg-white/10",
  "[&_pre]:mt-2 [&_pre]:overflow-auto [&_pre]:rounded-xl [&_pre]:bg-muted [&_pre]:p-3 dark:[&_pre]:bg-white/5",
].join(" ");

export function EnhancePanel({ content, contentKey, streaming, version, versions, onSelectVersion, error, onEnhance, unansweredCount }: Props) {
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
    <section className="glass rounded-[1.75rem] p-4 sm:p-5" aria-labelledby="enhanced-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id="enhanced-heading" className="font-semibold">Enhanced prompt{version ? ` · v${version}` : ""}</h2>
          {unansweredCount > 0 && !streaming && (
            <p className="text-xs text-muted-foreground">
              {unansweredCount} question{unansweredCount === 1 ? "" : "s"} not fully answered. The prompt asks the AI to check{" "}
              {unansweredCount === 1 ? "it" : "them"} with you first.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
      {error && <p role="alert" className="mt-3 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {content && (
        <div
          key={contentKey}
          role="region"
          aria-label="Enhanced prompt"
          aria-busy={streaming}
          tabIndex={0}
          className="mt-4 max-h-[36rem] overflow-auto rounded-2xl bg-white/60 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 motion-safe:animate-fade-in sm:p-5 dark:bg-white/5"
        >
          <SafeMarkdown className={PROMPT_TYPE} components={SECTION_HEADINGS}>
            {content}
          </SafeMarkdown>
        </div>
      )}
    </section>
  );
}
