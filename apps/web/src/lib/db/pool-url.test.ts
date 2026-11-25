import { describe, expect, it } from "vitest";
import { withPoolDefaults } from "./pool-url";

describe("withPoolDefaults", () => {
  it("adds a larger pool and a longer pool timeout when the URL sets neither", () => {
    const out = new URL(withPoolDefaults("postgresql://u:p@db.example.com:5432/lms?schema=public")!);
    expect(out.searchParams.get("connection_limit")).toBe("10");
    expect(out.searchParams.get("pool_timeout")).toBe("20");
    expect(out.searchParams.get("schema")).toBe("public");
  });

  it("keeps values already set in DATABASE_URL", () => {
    const out = new URL(withPoolDefaults("postgres://u:p@h/db?connection_limit=5&pool_timeout=9")!);
    expect(out.searchParams.get("connection_limit")).toBe("5");
    expect(out.searchParams.get("pool_timeout")).toBe("9");
  });

  it("turns on PgBouncer mode for a pooler host and allows time for a suspended database to wake", () => {
    const out = new URL(withPoolDefaults("postgresql://u:p@ep-x-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require")!);
    expect(out.searchParams.get("pgbouncer")).toBe("true");
    expect(out.searchParams.get("connect_timeout")).toBe("15");
    expect(out.searchParams.get("sslmode")).toBe("require");
  });

  it("does not turn on PgBouncer mode for a direct host", () => {
    const out = new URL(withPoolDefaults("postgresql://u:p@ep-x.c-5.us-east-2.aws.neon.tech/neondb")!);
    expect(out.searchParams.has("pgbouncer")).toBe(false);
  });

  it("leaves missing, non-Postgres and unparseable URLs alone", () => {
    expect(withPoolDefaults(undefined)).toBeUndefined();
    expect(withPoolDefaults("file:./dev.db")).toBe("file:./dev.db");
    expect(withPoolDefaults("not a url")).toBe("not a url");
  });
});
