"use client";
import { CheckCircle2, EyeOff, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBar } from "./status-bar";

type Props = {
  index: number;
  text: string;
  score: number;
  reason: string | null;
  notRelevant: boolean;
  active: boolean;
  onSelect(): void;
  onToggleRelevant(): void;
};

export function QuestionRow({ index, text, score, reason, notRelevant, active, onSelect, onToggleRelevant }: Props) {
  const ticked = !notRelevant && score >= 3;
  return (
    <li
      className={cn(
        "group rounded-2xl border p-3 transition-colors",
        active ? "border-primary/40 bg-primary/5" : "border-transparent hover:bg-white/55 dark:hover:bg-white/5",
        notRelevant && "opacity-55",
      )}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={ticked}
          readOnly
          tabIndex={-1}
          aria-label={ticked ? `${text}: fully answered` : `${text}: not fully answered yet`}
          className="pointer-events-none mt-1 size-4 shrink-0 accent-[var(--primary)]"
        />
        <button
          type="button"
          onClick={onSelect}
          aria-current={active ? "true" : undefined}
          className="min-w-0 flex-1 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span className="block text-sm font-medium leading-snug text-foreground">
            <span className="mr-1 text-muted-foreground">{index}.</span>
            {text}
          </span>
          {notRelevant ? (
            <span className="mt-1 block text-xs text-muted-foreground">Not relevant for this prompt</span>
          ) : (
            <span className="mt-2 flex items-center gap-2">
              <StatusBar score={score} label={text} />
              <span className="text-xs tabular-nums text-muted-foreground">{score}/3</span>
              {ticked && <CheckCircle2 className="size-3.5 text-emerald-500" aria-hidden />}
            </span>
          )}
          {!notRelevant && reason && <span className="mt-1 block text-xs text-muted-foreground">{reason}</span>}
        </button>
        <button
          type="button"
          onClick={onToggleRelevant}
          aria-label={notRelevant ? `Mark relevant again: ${text}` : `Mark not relevant: ${text}`}
          className="rounded-lg p-1.5 text-muted-foreground opacity-0 transition-[opacity,color] hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
        >
          {notRelevant ? <RotateCcw className="size-4" aria-hidden /> : <EyeOff className="size-4" aria-hidden />}
        </button>
      </div>
    </li>
  );
}
