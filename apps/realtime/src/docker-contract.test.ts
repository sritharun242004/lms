import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("realtime production image Prisma contract", () => {
  it("copies the canonical web schema and generates the runtime client before start", () => {
    const dockerfile = readFileSync(
      resolve(process.cwd(), "../../Dockerfile.realtime"),
      "utf8"
    );

    expect(dockerfile).toContain("COPY apps/web/package.json ./apps/web/");
    expect(dockerfile).toContain(
      "COPY apps/web/prisma/schema.prisma ./apps/web/prisma/schema.prisma"
    );
    const generate = "RUN npx prisma generate --schema apps/web/prisma/schema.prisma";
    expect(dockerfile).toContain(generate);
    expect(dockerfile.indexOf(generate)).toBeLessThan(dockerfile.indexOf('CMD ["npx", "tsx"'));
    expect(dockerfile).toContain("WORKDIR /app");
  });
});
