export interface PollAxis {
  /** Axis maximum: a whole number >= the highest vote count (and >= 1). */
  max: number;
  /** Tick values from 0 to `max`, at most 6 of them. */
  ticks: number[];
}

const MAX_INTERVALS = 5;

/** Smallest 1/2/5 x 10^n step that keeps the axis within MAX_INTERVALS. */
function tickStep(highest: number): number {
  for (let magnitude = 1; ; magnitude *= 10) {
    for (const multiple of [1, 2, 5]) {
      const step = multiple * magnitude;
      if (Math.ceil(highest / step) <= MAX_INTERVALS) return step;
    }
  }
}

/**
 * Whole-vote axis for the multiple-choice bar graph. Votes are integers, so
 * ticks are integers too; the maximum rounds up to the next tick so the
 * tallest bar only reaches the top of the plot when it lands on a tick.
 */
export function pollAxis(maxVotes: number): PollAxis {
  const highest = Number.isFinite(maxVotes) ? Math.max(1, Math.ceil(maxVotes)) : 1;
  const step = tickStep(highest);
  const intervals = Math.ceil(highest / step);
  return { max: intervals * step, ticks: Array.from({ length: intervals + 1 }, (_, i) => i * step) };
}
