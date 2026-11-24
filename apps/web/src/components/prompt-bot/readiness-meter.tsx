export function ReadinessMeter({ answered, relevant, ratio }: { answered: number; relevant: number; ratio: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">Readiness</span>
        <span className="tabular-nums text-muted-foreground">{answered} of {relevant} answered</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted dark:bg-white/10">
        <div
          className="h-full origin-left rounded-full bg-primary transition-transform duration-500 ease-out motion-reduce:transition-none"
          style={{ transform: `scaleX(${Math.max(0, Math.min(1, ratio))})` }}
        />
      </div>
    </div>
  );
}
