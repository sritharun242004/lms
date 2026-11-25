/** Shared display helpers for the Jobs flow (pure: safe for client components). */
export const megabytes = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/** A size for people: whole bytes, rounded-up KB, then one-decimal MB. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return megabytes(bytes);
}
