/**
 * Prisma's default pool is (CPUs × 2 + 1) connections: 3–5 on an App Runner instance. Ten people at once plus
 * background file analysis and skill generation queue behind that and pages hang. Unless DATABASE_URL already
 * sets them, use a larger pool and a longer wait before giving up.
 */
export const DEFAULT_CONNECTION_LIMIT = 10;
export const DEFAULT_POOL_TIMEOUT_SECONDS = 20;

export function withPoolDefaults(url: string | undefined): string | undefined {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    if (!parsed.protocol.startsWith("postgres")) return url;
    if (!parsed.searchParams.has("connection_limit")) parsed.searchParams.set("connection_limit", String(DEFAULT_CONNECTION_LIMIT));
    if (!parsed.searchParams.has("pool_timeout")) parsed.searchParams.set("pool_timeout", String(DEFAULT_POOL_TIMEOUT_SECONDS));
    return parsed.toString();
  } catch {
    return url;
  }
}
