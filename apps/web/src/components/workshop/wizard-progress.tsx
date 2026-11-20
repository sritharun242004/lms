// Steps 1-5 are the form, 6 is payment, 7 is the thank-you screen.
export const TOTAL_STEPS = 7;

export function WizardProgress({ current, total = TOTAL_STEPS }: { current: number; total?: number }) {
  return (
    <div>
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-primary">
        Step {current} of {total}
      </p>
      <div
        role="progressbar"
        aria-label="Registration progress"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={current}
        className="mt-3 flex gap-1.5"
      >
        {Array.from({ length: total }, (_, index) => (
          <span
            key={index}
            className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
              index < current ? "bg-primary" : "bg-slate-200"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
