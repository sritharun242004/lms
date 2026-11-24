/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/prompt-bot" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
afterEach(cleanup);

import { PromptBotTabs } from "./prompt-bot-tabs";

describe("PromptBotTabs", () => {
  it.each([
    ["/prompt-bot", "Prompt Bot"],
    ["/prompt-bot/cm123abc", "Prompt Bot"],
    ["/prompt-bot/matrices", "Prompt Bot"],
    ["/prompt-bot/skills", "Skills Builder"],
    ["/prompt-bot/skills/p1", "Skills Builder"],
    ["/prompt-bot/catalog", "Skills Builder"],
  ])("marks the current area for %s", (pathname, current) => {
    nav.pathname = pathname;
    render(createElement(PromptBotTabs));
    for (const name of ["Prompt Bot", "Skills Builder"]) {
      expect(screen.getByRole("link", { name }).getAttribute("aria-current")).toBe(name === current ? "page" : null);
    }
  });

  it("links to both areas", () => {
    render(createElement(PromptBotTabs));
    expect(screen.getByRole("link", { name: "Prompt Bot" }).getAttribute("href")).toBe("/prompt-bot");
    expect(screen.getByRole("link", { name: "Skills Builder" }).getAttribute("href")).toBe("/prompt-bot/skills");
  });
});
