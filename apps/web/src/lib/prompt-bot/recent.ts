/** A session edited within this window is offered as "Continue" at the top of the start page. */
export const CONTINUE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Splits newest-first sessions into the one to continue (if recent enough) and the rest. */
export function splitRecent<T extends { updatedAt: Date }>(sessions: T[], now = Date.now()): { resume: T | null; others: T[] } {
  const first = sessions[0];
  const resume = first && now - first.updatedAt.getTime() <= CONTINUE_WINDOW_MS ? first : null;
  return { resume, others: resume ? sessions.slice(1) : sessions };
}

export function updatedLabel(date: Date, now = Date.now()): string {
  const minutes = Math.round((now - date.getTime()) / 60_000);
  if (minutes < 1) return "Updated just now";
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (minutes < 60) return `Updated ${rtf.format(-minutes, "minute")}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Updated ${rtf.format(-hours, "hour")}`;
  return `Updated ${rtf.format(-Math.round(hours / 24), "day")}`;
}
