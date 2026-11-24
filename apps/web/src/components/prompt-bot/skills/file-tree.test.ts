/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileTree, groupFiles } from "./file-tree";

afterEach(cleanup);

const FILES = [
  { path: "scripts/b.py", content: "" },
  { path: "references/z.md", content: "" },
  { path: "SKILL.md", content: "" },
  { path: "assets/t.md", content: "" },
  { path: "references/a.md", content: "" },
];

describe("groupFiles", () => {
  it("puts SKILL.md first, then references, scripts and assets", () => {
    expect(groupFiles(FILES).map((g) => [g.folder, g.files.map((f) => f.path)])).toEqual([
      [null, ["SKILL.md"]],
      ["references", ["references/a.md", "references/z.md"]],
      ["scripts", ["scripts/b.py"]],
      ["assets", ["assets/t.md"]],
    ]);
  });
});

describe("FileTree", () => {
  it("lists files in order, marks the selected one and reports clicks", () => {
    const onSelect = vi.fn();
    render(createElement(FileTree, { files: FILES, selected: "references/a.md", onSelect }));
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["SKILL.md", "a.md", "z.md", "b.py", "t.md"]);
    expect(screen.getByRole("button", { name: "a.md" }).getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("button", { name: "z.md" }).getAttribute("aria-current")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "z.md" }));
    expect(onSelect).toHaveBeenCalledWith("references/z.md");
    expect(screen.getByRole("navigation", { name: "Skill files" })).toBeTruthy();
  });
});
