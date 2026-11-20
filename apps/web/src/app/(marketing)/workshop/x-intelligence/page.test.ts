/** @vitest-environment jsdom */

import { createElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import XiLandingPage from "./page";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("XI workshop landing page", () => {
  it("renders the single approved price and the primary CTA text", () => {
    const { container, getAllByText } = render(createElement(XiLandingPage));
    expect(container.textContent).toContain("28,250");
    expect(getAllByText(/Reserve my seat/i).length).toBeGreaterThan(0);
  });

  it("flags unconfirmed items as TBC rather than inventing them", () => {
    const { container } = render(createElement(XiLandingPage));
    expect(container.textContent).toMatch(/venue.*(to be confirmed|TBC)/i);
  });

  it("shows no workshop dates, no Vjal Institute mentions, and no second price", () => {
    const { container } = render(createElement(XiLandingPage));
    expect(container.textContent).not.toMatch(/\b(26|27) Nov\b/i);
    expect(container.textContent).not.toContain("Nov 2026");
    expect(container.textContent).not.toMatch(/vjal/i);
    expect(container.textContent).not.toContain("31,275");
    expect(container.textContent).not.toContain("55,490");
    expect(container.textContent).not.toContain("23,940");
  });
});
