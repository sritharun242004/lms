/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EnhancePanel } from "./enhance-panel";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const PROMPT = `## Persona
You are a copywriter.

## Output expectations
- One email under **150 words**.
- See [the brief](https://example.com/brief).

![pixel](https://example.com/pixel.png)

## Iteration request
Before you write, ask me which industry to target.`;

const props = {
  content: PROMPT,
  contentKey: 0,
  streaming: false,
  version: 2,
  versions: [2, 1],
  onSelectVersion: vi.fn(),
  error: null,
  onEnhance: vi.fn(),
  unansweredCount: 0,
};

describe("EnhancePanel", () => {
  it("renders the prompt as formatted sections instead of raw Markdown", () => {
    render(createElement(EnhancePanel, props));
    const region = screen.getByRole("region", { name: "Enhanced prompt" });
    expect(screen.getByRole("heading", { level: 3, name: "Persona" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "Output expectations" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "Iteration request" })).toBeTruthy();
    expect(region.textContent).not.toContain("##");
    expect(region.querySelector("strong")?.textContent).toBe("150 words");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("opens links in a new tab and loads no images", () => {
    render(createElement(EnhancePanel, props));
    const link = screen.getByRole("link", { name: "the brief" });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(document.querySelector("img")).toBeNull();
  });

  it("copies the clean Markdown text", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(createElement(EnhancePanel, props));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    });
    expect(writeText).toHaveBeenCalledWith(PROMPT);
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
  });

  it("formats the text while it streams in", () => {
    render(createElement(EnhancePanel, { ...props, content: "## Persona\nYou are", streaming: true }));
    expect(screen.getByRole("heading", { level: 3, name: "Persona" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Copy" })).toBeNull();
  });

  it("says unanswered questions become clarifying questions for the AI", () => {
    render(createElement(EnhancePanel, { ...props, unansweredCount: 3 }));
    expect(screen.getByText(/3 questions not fully answered/)).toBeTruthy();
  });
});
