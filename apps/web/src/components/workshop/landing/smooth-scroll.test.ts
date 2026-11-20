/** @vitest-environment jsdom */

import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useReducedMotion } = vi.hoisted(() => ({ useReducedMotion: vi.fn() }));
vi.mock("motion/react", () => ({ useReducedMotion }));

import { SmoothScroll } from "./smooth-scroll";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  useReducedMotion.mockReset();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  );
});

describe("SmoothScroll", () => {
  it("still renders its children when the visitor prefers reduced motion", () => {
    useReducedMotion.mockReturnValue(true);
    render(createElement(SmoothScroll, null, createElement("p", null, "Hello")));
    expect(screen.getByText("Hello")).toBeTruthy();
  });

  it("still renders its children when smooth scrolling is enabled", () => {
    useReducedMotion.mockReturnValue(false);
    render(createElement(SmoothScroll, null, createElement("p", null, "Hello")));
    expect(screen.getByText("Hello")).toBeTruthy();
  });
});
