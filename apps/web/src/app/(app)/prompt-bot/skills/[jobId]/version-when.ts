const WHEN = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** "25 Nov 14:02" (spec): built from parts so no locale adds a comma between date and time. */
export function when(iso: string): string {
  const part = Object.fromEntries(WHEN.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${part.day} ${part.month} ${part.hour}:${part.minute}`;
}
