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
  it("renders all three approved package prices and the primary CTA text", () => {
    const { container, getAllByText } = render(createElement(XiLandingPage));
    expect(container.textContent).toContain("28,250");
    expect(container.textContent).toContain("31,275");
    expect(container.textContent).toContain("55,490");
    expect(container.textContent).toContain("USD 252");
    expect(container.textContent).toContain("USD 279");
    expect(container.textContent).toContain("USD 495");
    expect(getAllByText(/Reserve my seat/i).length).toBeGreaterThan(0);
  });

  it("flags unconfirmed items as TBC rather than inventing them", () => {
    const { container } = render(createElement(XiLandingPage));
    expect(container.textContent).toMatch(/venue.*(to be confirmed|TBC)/i);
  });

  it("shows no workshop dates and no Vjal Institute mention", () => {
    const { container } = render(createElement(XiLandingPage));
    expect(container.textContent).not.toMatch(/\b(26|27) Nov\b/i);
    expect(container.textContent).not.toMatch(/\b(Thu|Fri) \d/);
    expect(container.textContent).not.toMatch(/vjal/i);
  });

  it("follows the brief's no-dash copy rule", () => {
    const { container } = render(createElement(XiLandingPage));
    expect(container.textContent).not.toMatch(/[\u2013\u2014]/);
  });
});
