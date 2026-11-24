import { cn } from "@/lib/utils";

const FILL = ["", "bg-amber-400", "bg-primary", "bg-emerald-500"] as const;

/**
 * Three equal slices; fills to `score` (0–3). Colour: amber 1, blue 2, green 3. When a score
 * arrives the slices grow left to right (scaleX, staggered) and recolour; nothing animates on mount.
 */
export function StatusBar({ score, label }: { score: number; label: string }) {
  const value = Math.max(0, Math.min(3, Math.round(score)));
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={3} aria-valuenow={value} className="flex w-20 shrink-0 gap-1">
      {[1, 2, 3].map((slice) => {
        const filled = slice <= value;
        return (
          <span key={slice} data-filled={filled} className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted dark:bg-white/10">
            <span
              className={cn(
                "block h-full origin-left rounded-full transition-[transform,background-color] duration-300 ease-out motion-reduce:transition-none",
                filled ? FILL[value] : "bg-transparent",
              )}
              style={{ transform: `scaleX(${filled ? 1 : 0})`, transitionDelay: filled ? `${(slice - 1) * 60}ms` : "0ms" }}
            />
          </span>
        );
      })}
    </div>
  );
}
