import type { ReactNode } from "react";

/**
 * Overall progress: how many relevant questions are fully answered, and a bar of total points.
 * `children` (usually the panel heading) sits on the same line as the count.
 */
export function ReadinessMeter({ answered, relevant, ratio, children }: { answered: number; relevant: number; ratio: number; children?: ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        {children}
        <p className="shrink-0 text-sm tabular-nums text-muted-foreground">
          <span className="font-semibold text-foreground">{answered}</span> of {relevant} ready
        </p>
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted dark:bg-white/10">
        <div
          className="h-full origin-left rounded-full bg-primary transition-transform duration-300 ease-out motion-reduce:transition-none"
          style={{ transform: `scaleX(${Math.max(0, Math.min(1, ratio))})` }}
        />
      </div>
    </div>
  );
}
