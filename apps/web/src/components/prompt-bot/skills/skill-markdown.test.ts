/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { SkillMarkdown } from "./skill-markdown";

afterEach(cleanup);

const md = (body: string) => `---\nname: "board-update"\ndescription: "x"\n---\n\n${body}\n`;

describe("SkillMarkdown", () => {
  it("opens links in a new tab without handing the page to the target", () => {
    render(createElement(SkillMarkdown, { content: md("See [the guide](https://example.com/guide).") }));
    const link = screen.getByRole("link", { name: "the guide" });
    expect(link.getAttribute("href")).toBe("https://example.com/guide");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("renders no images, so a skill never loads remote content", () => {
    const { container } = render(createElement(SkillMarkdown, { content: md("![tracker](https://example.com/pixel.png)") }));
    expect(container.querySelector("img")).toBeNull();
  });
});
