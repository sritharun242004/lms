import { describe, expect, it } from "vitest";
import { parseStoredFiles } from "./stored-files";

describe("parseStoredFiles", () => {
  it("returns the stored text files as they are", () => {
    const files = [{ path: "SKILL.md", content: "x" }, { path: "references/a.md", content: "" }];
    expect(parseStoredFiles(files)).toEqual(files);
  });

  it("returns null when there are no files or they can't be read", () => {
    for (const value of [null, undefined, { not: "an array" }, [{ path: "SKILL.md" }], [{ path: 1, content: "x" }], "SKILL.md"]) {
      expect(parseStoredFiles(value)).toBeNull();
    }
  });
});
