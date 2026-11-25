"use client";
import * as React from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { SkillRole } from "@/lib/skills/jobs/types";

/** What to say in Claude chat: the main skill runs the whole job, a sub-skill one part. */
export const chatPhrase = (role: SkillRole, skill: string) => (role === "MAIN" ? `use ${skill} for this` : `use ${skill} on this…`);
/** The plugin command in Claude Code and Cowork. */
export const slashCommand = (plugin: string, skill: string) => `/${plugin}:${skill}`;

type Props = { plugin: string; skill: string; role: SkillRole };

/** How to call one skill of the plugin, with a copy button per line. */
export function HowToCall({ plugin, skill, role }: Props) {
  const phrase = chatPhrase(role, skill);
  const command = slashCommand(plugin, skill);
  return (
    <section aria-label={`How to call ${skill}`} className="mt-4 border-t border-border/60 pt-3">
      <h4 className="text-xs font-medium text-muted-foreground">How to call it</h4>
      <ul className="mt-1.5 flex flex-col gap-1">
        <CallLine where="In Claude chat: say" value={`“${phrase}”`} copy={phrase} copyLabel={`Copy chat phrase: ${skill}`} />
        <CallLine where="Claude Code / Cowork:" value={command} copy={command} copyLabel={`Copy command: ${skill}`} mono />
      </ul>
    </section>
  );
}

function CallLine({ where, value, copy, copyLabel, mono }: { where: string; value: string; copy: string; copyLabel: string; mono?: boolean }) {
  const [copied, setCopied] = React.useState(false);
  React.useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(copy);
      setCopied(true);
    } catch {
      toast.error("We couldn't copy that. Select the text and copy it instead.");
    }
  }

  return (
    <li className="flex items-center gap-2 text-sm">
      <p className="min-w-0 flex-1 text-pretty">
        <span className="text-muted-foreground">{where}</span>{" "}
        <span className={mono ? "font-mono text-[0.8125rem] break-all text-foreground" : "font-medium break-words text-foreground"}>{value}</span>
      </p>
      <Button type="button" variant="ghost" size="icon" aria-label={copyLabel} className="size-11 shrink-0 text-muted-foreground hover:text-foreground sm:size-8" onClick={() => void onCopy()}>
        {copied ? <Check className="size-4 text-success" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      </Button>
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied" : ""}
      </span>
    </li>
  );
}
