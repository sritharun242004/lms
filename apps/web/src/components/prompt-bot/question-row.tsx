"use client";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBar } from "./status-bar";

type Props = {
  index: number;
  text: string;
  /** Short lead-in before the question, such as "Finally". */
  lead?: string;
  score: number;
  reason: string | null;
  active: boolean;
  onSelect(): void;
};

/** Read-only tick that animates in at 3/3. The native checkbox stays in the tree for its role and name. */
function Tick({ ticked, label }: { ticked: boolean; label: string }) {
  return (
    <span className="relative mt-0.5 grid size-4 shrink-0 place-items-center">
      <input type="checkbox" checked={ticked} readOnly tabIndex={-1} aria-label={label} className="peer sr-only" />
      <span
        aria-hidden
        className="absolute inset-0 rounded-[5px] bg-white/70 ring-1 ring-inset ring-slate-300 transition-[background-color,box-shadow] duration-200 ease-out peer-checked:bg-primary peer-checked:ring-primary motion-reduce:transition-none dark:bg-white/5 dark:ring-white/25 dark:peer-checked:bg-primary dark:peer-checked:ring-primary"
      />
      <Check
        aria-hidden
        strokeWidth={3}
        className="relative size-3 scale-50 text-white opacity-0 transition-[opacity,scale] duration-200 ease-out peer-checked:scale-100 peer-checked:opacity-100 motion-reduce:transition-none"
      />
    </span>
  );
}

export function QuestionRow({ index, text, lead, score, reason, active, onSelect }: Props) {
  const ticked = score >= 3;
  // A 3/3 note is collapsed to one faded line beside the bar (shown on hover or focus, full text in
  // its title) until the row is selected; other notes stay visible, clamped to two lines.
  const collapsed = ticked && !active;
  return (
    <li
      className={cn(
        // `!`: globals.css sets border-color on every element outside a layer, which beats plain utilities.
        "group rounded-2xl border px-2.5 py-1.5 transition-colors duration-200",
        active ? "border-primary/40! bg-primary/5" : "border-transparent! hover:bg-white/55 dark:hover:bg-white/5",
      )}
    >
      <div className="flex items-start gap-2.5">
        <Tick ticked={ticked} label={ticked ? `${text}: fully answered` : `${text}: not fully answered yet`} />
        <button
          type="button"
          onClick={onSelect}
          aria-current={active ? "true" : undefined}
          className="min-w-0 flex-1 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span className="block text-sm font-medium leading-snug text-foreground">
            <span className="mr-1 tabular-nums text-muted-foreground">{index}.</span>
            {lead && <span className="mr-1 font-semibold text-primary dark:text-brand-400">{lead}:</span>}
            {text}
          </span>
          <span className="mt-1 flex min-w-0 items-center gap-2">
            <StatusBar score={score} label={text} />
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{score}/3</span>
            {collapsed && reason && (
              <span
                data-collapsed="true"
                title={reason}
                className="min-w-0 truncate text-xs text-muted-foreground opacity-0 transition-opacity duration-150 ease-out group-focus-within:opacity-100 group-hover:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100"
              >
                {reason}
              </span>
            )}
          </span>
          {!collapsed && reason && (
            <span data-collapsed="false" className={cn("mt-0.5 block text-xs leading-snug text-muted-foreground", !active && "line-clamp-2")}>
              {reason}
            </span>
          )}
        </button>
      </div>
    </li>
  );
}
