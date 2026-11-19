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
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("XI workshop landing page", () => {
  it("renders the approved dates, pricing, and primary CTA text", () => {
    const { container, getAllByText } = render(createElement(XiLandingPage));
    expect(container.textContent).toContain("26");
    expect(container.textContent).toContain("27 Nov 2026");
    expect(container.textContent).toContain("28,250");
    expect(container.textContent).toContain("31,275");
    expect(container.textContent).toContain("55,490");
    expect(getAllByText(/Reserve my seat/i).length).toBeGreaterThan(0);
  });

  it("flags unconfirmed items as TBC rather than inventing them", () => {
    const { container } = render(createElement(XiLandingPage));
    expect(container.textContent).toMatch(/venue.*(to be confirmed|TBC)/i);
  });
});
