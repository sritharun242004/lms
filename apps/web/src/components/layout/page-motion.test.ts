import { createElement, type ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { PageMotion } from "./page-motion";

describe("PageMotion layout", () => {
  it("grows to the full available width inside the focused chat flex container", () => {
    const element = PageMotion({ children: createElement("div", null, "Chat") }) as ReactElement<{
      className?: string;
    }>;

    expect(element.props.className).toContain("flex-1");
    expect(element.props.className).toContain("w-full");
    expect(element.props.className).toContain("min-w-0");
  });
});
