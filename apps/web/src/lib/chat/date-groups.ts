const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** "Today", "Yesterday", otherwise "October 2026" (local time). */
export function dateHeading(date: Date, now: Date = new Date()): string {
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export interface DateGroup<T> {
  heading: string;
  items: T[];
}

/**
 * Group an already newest-first list under date headings. Order is preserved;
 * a heading only repeats if the list itself is not sorted, so callers should
 * pass items sorted by the same date.
 */
export function groupByDate<T>(
  items: readonly T[],
  getDate: (item: T) => Date | string,
  now: Date = new Date()
): DateGroup<T>[] {
  const groups: DateGroup<T>[] = [];
  for (const item of items) {
    const raw = getDate(item);
    const date = raw instanceof Date ? raw : new Date(raw);
    const heading = Number.isNaN(date.getTime()) ? "Unknown date" : dateHeading(date, now);
    const last = groups[groups.length - 1];
    if (last && last.heading === heading) last.items.push(item);
    else groups.push({ heading, items: [item] });
  }
  return groups;
}
