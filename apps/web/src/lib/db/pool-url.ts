/**
 * Prisma's default pool is (CPUs × 2 + 1) connections: 3–5 on an App Runner instance. Ten people at once plus
 * background file analysis and skill generation queue behind that and pages hang. Unless DATABASE_URL already
 * sets them, use a larger pool and a longer wait before giving up.
 */
export const DEFAULT_CONNECTION_LIMIT = 10;
export const DEFAULT_POOL_TIMEOUT_SECONDS = 20;
export const DEFAULT_CONNECT_TIMEOUT_SECONDS = 15;

export function withPoolDefaults(url: string | undefined): string | undefined {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    if (!parsed.protocol.startsWith("postgres")) return url;
    if (!parsed.searchParams.has("connection_limit")) parsed.searchParams.set("connection_limit", String(DEFAULT_CONNECTION_LIMIT));
    if (!parsed.searchParams.has("pool_timeout")) parsed.searchParams.set("pool_timeout", String(DEFAULT_POOL_TIMEOUT_SECONDS));
    // A PgBouncer-style pooler (Neon's "-pooler" host) runs in transaction mode: Prisma must not reuse prepared
    // statements across connections, or concurrent users hit "prepared statement already exists" errors.
    if (parsed.hostname.includes("-pooler") && !parsed.searchParams.has("pgbouncer")) parsed.searchParams.set("pgbouncer", "true");
    // Neon suspends an idle database; the first connection after a quiet spell can take a few seconds.
    if (!parsed.searchParams.has("connect_timeout")) parsed.searchParams.set("connect_timeout", String(DEFAULT_CONNECT_TIMEOUT_SECONDS));
    return parsed.toString();
  } catch {
    return url;
  }
}
