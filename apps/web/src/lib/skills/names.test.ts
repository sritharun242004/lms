import { describe, expect, it } from "vitest";
import { isValidSkillName, normalizeSkillName, oneLine, uniqueSkillName } from "./names";

describe("normalizeSkillName", () => {
  it.each([
    ["Board Update Writer", "board-update-writer"],
    ["  --Weekly   KPI report!!", "weekly-kpi-report"],
    ["Café Menü", "cafe-menu"],
    ["a__b..c", "a-b-c"],
    ["", "skill"],
    ["!!!", "skill"],
  ])("normalises %j to %j", (raw, expected) => {
    expect(normalizeSkillName(raw)).toBe(expected);
  });

  it("caps at 64 characters without leaving a trailing hyphen", () => {
    const name = normalizeSkillName(`${"a".repeat(63)} b`);
    expect(name).toBe("a".repeat(63));
    expect(isValidSkillName(name)).toBe(true);
  });

  it("uses the given fallback when nothing is left", () => {
    expect(normalizeSkillName("???", "skill-pack")).toBe("skill-pack");
  });
});

describe("uniqueSkillName", () => {
  it("adds a numeric suffix when the name is taken", () => {
    expect(uniqueSkillName("Board update", ["board-update"])).toBe("board-update-2");
    expect(uniqueSkillName("board-update", ["board-update", "board-update-2"])).toBe("board-update-3");
    expect(uniqueSkillName("Board update", [])).toBe("board-update");
  });

  it("keeps a suffixed name within 64 characters", () => {
    const long = "a".repeat(64);
    const name = uniqueSkillName(long, [long]);
    expect(name).toBe(`${"a".repeat(62)}-2`);
    expect(isValidSkillName(name)).toBe(true);
  });
});

describe("isValidSkillName", () => {
  it("applies the Agent Skills name rule", () => {
    expect(isValidSkillName("pdf-tools")).toBe(true);
    for (const bad of ["-a", "a-", "a--b", "A", "a_b", "", "a".repeat(65)]) expect(isValidSkillName(bad)).toBe(false);
  });
});

describe("oneLine", () => {
  it("collapses whitespace and cuts to the limit", () => {
    expect(oneLine("  two\n\nlines\t here ")).toBe("two lines here");
    expect(oneLine("abcdef", 3)).toBe("abc");
  });
});
