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
    expect(coachLogin).toContain('redirect("/admin/login")');
    expect(superAdminLogin).toContain('redirect("/admin/login")');
    expect(participantLogin).toContain('redirect("/")');
    expect(participantLogin).not.toContain("StaffLoginForm");
  });

  it("restores a responsive split auth shell with current staff-oriented copy", () => {
    const layout = source("./layout.tsx");

    expect(layout).toContain("lg:grid-cols");
    expect(layout).toContain("Staff workspace");
    expect(layout).not.toContain("Participant portal");
  });

  it("keeps coach signup content while linking to the common staff login", () => {
    const signup = source("./coach/signup/page.tsx");

    expect(signup).toContain("Create coach account");
    expect(signup).toContain("approved by your Super Admin");
    expect(signup).toContain('href="/admin/login"');
    expect(signup).toContain('router.push("/coach/dashboard")');
    expect(signup).toContain("text-black");
  });
});
