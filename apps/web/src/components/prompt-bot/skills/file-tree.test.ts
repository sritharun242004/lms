/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileTree, formatBytes, groupFiles } from "./file-tree";

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

  it("shows an original file's size next to its name", () => {
    render(createElement(FileTree, { files: [{ path: "SKILL.md" }, { path: "assets/deck.pptx", bytes: 4_404_019, asset: true }], selected: null, onSelect: vi.fn() }));
    const asset = screen.getByRole("button", { name: /deck\.pptx/ });
    expect(asset.textContent).toBe("deck.pptx4.2 MB");
    expect(asset.getAttribute("data-asset")).toBe("true");
  });
});

describe("formatBytes", () => {
  it("uses B, KB and one-decimal MB", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1500)).toBe("2 KB");
    expect(formatBytes(4_404_019)).toBe("4.2 MB");
    expect(formatBytes(20 * 1024 * 1024)).toBe("20.0 MB");
  });
});
