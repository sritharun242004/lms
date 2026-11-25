import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

describe("unified auth route and presentation contracts", () => {
  it("provides the common staff login and redirects legacy staff portals", () => {
    const adminLogin = source("./admin/login/page.tsx");
    const coachLogin = source("./coach/login/page.tsx");
    const superAdminLogin = source("./super-admin/login/page.tsx");
    const participantLogin = source("./participant/login/page.tsx");

    expect(adminLogin).toContain("<StaffLoginForm");
    // Both forward to the one staff login, keeping a safe return path
    // (behaviour covered in portal-navigation.test.ts).
    expect(coachLogin).toContain("redirect(staffLoginRedirect(");
    expect(superAdminLogin).toContain("redirect(staffLoginRedirect(");
    expect(participantLogin).toContain('redirect("/login")');
    expect(participantLogin).not.toContain("StaffLoginForm");
  });

  it("restores a responsive split auth shell with current staff-oriented copy", () => {
    const layout = source("./layout.tsx");

    expect(layout).toContain("lg:grid-cols");
    expect(layout).toContain("Staff workspace");
    expect(layout).not.toContain("Participant portal");
  });
});
