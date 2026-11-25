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

## Plan
1. Ask which industry to target and wait.
2. Draft the email.

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
    expect(screen.getByRole("heading", { level: 3, name: "Plan" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "Output expectations" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "Iteration request" })).toBeTruthy();
    expect(region.textContent).not.toContain("##");
    expect(region.querySelector("strong")?.textContent).toBe("150 words");
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });

  it("renders a v5 prompt's six Elements of LLM Prompts as sections", () => {
    const v5 = `## Persona\nYou are an **expert recruiter**.\n\n## Context\nWe are **XYZ**.\n\n## Data\nWe offer 1) healthcare 2) travel.\n\n## Output Expectations\nPlease help us write a **job description**.\n\n## Iteration Request\nAsk me questions first.\n1. Draft.\n\n## Examples\nFollow our template.`;
    render(createElement(EnhancePanel, { ...props, content: v5 }));
    for (const name of ["Persona", "Context", "Data", "Output Expectations", "Iteration Request", "Examples"]) {
      expect(screen.getByRole("heading", { level: 3, name })).toBeTruthy();
    }
    expect(screen.getByRole("region", { name: "Enhanced prompt" }).textContent).not.toContain("##");
  });

  it("still renders a saved v4 prompt's sections, bold facts and inline-numbered details", () => {
    const v4 = `## Persona\nYou are an **expert recruiter with 20 years of experience**.\n\n## Context\nWe are **XYZ Auto Components Group**.\n\n## Data/Details\nWe offer benefits such as 1) healthcare 2) travel.\n\n## Plan\n1. Draft the job description.\n\n## Instructions\nPlease help us recruit a **Head of North America**. Let's start by writing a **job description**.`;
    render(createElement(EnhancePanel, { ...props, content: v4 }));
    const region = screen.getByRole("region", { name: "Enhanced prompt" });
    for (const name of ["Persona", "Context", "Data/Details", "Plan", "Instructions"]) {
      expect(screen.getByRole("heading", { level: 3, name })).toBeTruthy();
    }
    expect([...region.querySelectorAll("strong")].map((b) => b.textContent)).toContain("expert recruiter with 20 years of experience");
    expect(region.textContent).toContain("such as 1) healthcare 2) travel.");
    expect(region.textContent).not.toContain("##");
  });

  it("renders the Plan as a numbered list in step order", () => {
    render(createElement(EnhancePanel, props));
    const plan = screen.getByRole("heading", { level: 3, name: "Plan" }).nextElementSibling!;
    expect(plan.tagName).toBe("OL");
    expect([...plan.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["Ask which industry to target and wait.", "Draft the email."]);
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
