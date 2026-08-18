/** @vitest-environment jsdom */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LandingPage } from "./landing-page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams("code=INVITE-7"),
}));

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({ join: vi.fn() }),
}));

describe("participant landing", () => {
  it("renders one participant entry experience without staff or promotional content", () => {
    const html = renderToStaticMarkup(createElement(LandingPage));

    expect(html).toContain("Let’s get started");
    expect(html).toContain("Participant portal");
    expect(html).not.toContain("Coach or staff sign in");
    expect(html).not.toContain("Staff sign in");
    expect(html).not.toContain("Keep every participant in the loop");
  });

  it("prefills the participant invite code from the landing query", () => {
    const html = renderToStaticMarkup(createElement(LandingPage));

    expect(html).toContain('value="INVITE-7"');
  });
});
