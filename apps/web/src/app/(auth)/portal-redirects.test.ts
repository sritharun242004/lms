import { beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({ login: vi.fn() }),
}));

import JoinPage from "./join/page";
import ParticipantLoginPage from "./participant/login/page";
import LegacySignupPage from "./signup/page";

beforeEach(() => redirect.mockClear());

describe("legacy and participant entry redirects", () => {
  it("preserves the invite code when /join leads to participant entry", async () => {
    await JoinPage({ searchParams: Promise.resolve({ code: "CMS A/B" }) });

    expect(redirect).toHaveBeenCalledWith("/login?code=CMS%20A%2FB");
  });

  it("redirects legacy /participant/login to the participant portal at /login", async () => {
    ParticipantLoginPage();

    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("redirects legacy /signup to the staff login", async () => {
    LegacySignupPage();

    expect(redirect).toHaveBeenCalledWith("/admin/login");
  });
});
