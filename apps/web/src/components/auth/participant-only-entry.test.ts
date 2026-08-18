import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

describe("participant name-and-code-only entry", () => {
  it("removes account-claim prompts from participant pages", () => {
    const profile = source("../../app/(app)/profile/page.tsx");
    const dashboard = source("../../app/(app)/mentee/dashboard/page.tsx");

    expect(profile).not.toContain("SecureAccountBanner");
    expect(dashboard).not.toContain("SecureAccountBanner");
  });

  it("removes participant credential methods from the auth client and provider", () => {
    const service = source("../../lib/api/services/auth-service.ts");
    const provider = source("../../providers/auth-provider.tsx");

    expect(service).not.toContain("claimAccount");
    expect(provider).not.toContain("claimAccount");
    expect(service).not.toContain("/auth/participant/login");
  });
});
