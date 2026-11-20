/** @vitest-environment jsdom */

import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SmoothScroll } from "./smooth-scroll";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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

function mockMatchMedia(reduced: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("reduce") ? reduced : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
}

describe("SmoothScroll", () => {
  it("still renders its children when the visitor prefers reduced motion", () => {
    mockMatchMedia(true);
    render(createElement(SmoothScroll, {}, createElement("p", null, "Hello")));
    expect(screen.getByText("Hello")).toBeTruthy();
  });

  it("still renders its children when smooth scrolling is enabled", () => {
    mockMatchMedia(false);
    render(createElement(SmoothScroll, {}, createElement("p", null, "Hello")));
    expect(screen.getByText("Hello")).toBeTruthy();
  });
});
