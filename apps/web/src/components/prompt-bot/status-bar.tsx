import { cn } from "@/lib/utils";

const FILL = ["", "bg-amber-400", "bg-primary", "bg-emerald-500"] as const;

/** Three equal slices; fills to `score` (0–3). Colour: amber 1, blue 2, green 3. */
export function StatusBar({ score, label }: { score: number; label: string }) {
  const value = Math.max(0, Math.min(3, Math.round(score)));
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={3} aria-valuenow={value} className="flex w-24 gap-1">
      {[1, 2, 3].map((slice) => (
        <span
          key={slice}
          data-filled={slice <= value}
          className={cn(
            "h-1.5 flex-1 rounded-full transition-colors duration-300",
            slice <= value ? FILL[value] : "bg-muted dark:bg-white/10",
          )}
        />
      ))}
    </div>
  );
}
