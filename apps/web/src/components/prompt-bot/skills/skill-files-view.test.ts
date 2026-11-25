/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { SkillFilesView } from "./skill-files-view";

afterEach(cleanup);

const FILES = [
  { path: "SKILL.md", content: '---\nname: board-update\ndescription: "Writes it."\n---\n\n# Board update\n\nStart from the deck.\n' },
  { path: "references/style-guide.md", content: "# Style guide\n\nNavy #1F4E79." },
  { path: "scripts/count.py", content: "print(1)" },
];
const ASSETS = [{ path: "assets/q3-deck.pptx", bytes: 4_404_019, fileName: "Q3 deck.pptx" }];

describe("SkillFilesView", () => {
  it("opens on SKILL.md rendered as Markdown", () => {
    render(createElement(SkillFilesView, { files: FILES, assets: ASSETS }));
    expect(screen.getByRole("heading", { name: "Board update" })).toBeTruthy();
    expect(screen.getByLabelText("Frontmatter").textContent).toContain("name: board-update");
    expect(screen.getByRole("button", { name: "SKILL.md" }).getAttribute("aria-current")).toBe("true");
  });

  it("shows other text files as-is, with the script notice on scripts", () => {
    render(createElement(SkillFilesView, { files: FILES, assets: ASSETS }));
    fireEvent.click(screen.getByRole("button", { name: "style-guide.md" }));
    expect(screen.getByLabelText("Contents of references/style-guide.md").textContent).toBe("# Style guide\n\nNavy #1F4E79.");
    expect(screen.queryByRole("note")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "count.py" }));
    expect(screen.getByRole("note").textContent).toContain("Review scripts before running them");
  });

  it("describes an original file without trying to show its bytes", () => {
    render(createElement(SkillFilesView, { files: FILES, assets: ASSETS }));
    fireEvent.click(screen.getByRole("button", { name: /q3-deck\.pptx/ }));
    expect(screen.getByText("Q3 deck.pptx")).toBeTruthy();
    expect(screen.getByText("Original file · 4.2 MB")).toBeTruthy();
    expect(screen.queryByLabelText(/Contents of assets/)).toBeNull();
  });

  it("has no editing controls", () => {
    render(createElement(SkillFilesView, { files: FILES, assets: ASSETS }));
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("says so when there are no files", () => {
    render(createElement(SkillFilesView, { files: [] }));
    expect(screen.getByText("This version has no files.")).toBeTruthy();
  });
});
