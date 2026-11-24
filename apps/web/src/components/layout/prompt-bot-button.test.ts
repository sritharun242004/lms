/** @vitest-environment jsdom */

import { createElement, type ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PromptBotButton } from "./prompt-bot-button";

const { usePathname } = vi.hoisted(() => ({ usePathname: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));

afterEach(cleanup);

describe("PromptBotButton", () => {
  it("links to /prompt-bot with an accessible name and is not current elsewhere", () => {
    usePathname.mockReturnValue("/dashboard");
    render(createElement(PromptBotButton));
    const link = screen.getByRole("link", { name: "Prompt Bot" });
    expect(link.getAttribute("href")).toBe("/prompt-bot");
    expect(link.getAttribute("aria-current")).toBeNull();
  });

  it.each(["/prompt-bot", "/prompt-bot/skills"])("is current on %s", (path) => {
    usePathname.mockReturnValue(path);
    render(createElement(PromptBotButton));
    expect(screen.getByRole("link", { name: "Prompt Bot" }).getAttribute("aria-current")).toBe("page");
  });

  it("is not current on a path that merely shares the prefix text", () => {
    usePathname.mockReturnValue("/prompt-botany");
    render(createElement(PromptBotButton));
    expect(screen.getByRole("link", { name: "Prompt Bot" }).getAttribute("aria-current")).toBeNull();
  });

  it("default variant keeps the soft tinted pill", () => {
    usePathname.mockReturnValue("/dashboard");
    render(createElement(PromptBotButton));
    const link = screen.getByRole("link", { name: "Prompt Bot" });
    expect(link.getAttribute("data-variant")).toBe("default");
    expect(link.className).toContain("bg-primary/10");
    expect(link.className).not.toContain("bg-gradient-to-b");
  });

  it("featured variant is a filled primary pill with label, aria-label and decorative icon", () => {
    usePathname.mockReturnValue("/dashboard");
    render(createElement(PromptBotButton, { variant: "featured" }));
    const link = screen.getByRole("link", { name: "Prompt Bot" });
    expect(link.getAttribute("data-variant")).toBe("featured");
    expect(link.className).toContain("text-primary-foreground");
    expect(link.className).toContain("rounded-full");
    expect(link.className).not.toContain("bg-primary/10");
    expect(link.querySelector("span")?.textContent).toBe("Prompt Bot");
    expect(link.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(link.querySelector("svg")?.getAttribute("class")).toContain("prompt-bot-sparkle");
  });

  it("featured variant marks the current page", () => {
    usePathname.mockReturnValue("/prompt-bot");
    render(createElement(PromptBotButton, { variant: "featured" }));
    const link = screen.getByRole("link", { name: "Prompt Bot" });
    expect(link.getAttribute("aria-current")).toBe("page");
    expect(link.className).toContain("ring-primary/40");
  });
});
