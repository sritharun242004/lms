import { describe, expect, it } from "vitest";
import { cleanSplit } from "./split";

const ACTIVE = new Set(["impeccable", "pptx", "docx", "xlsx", "pdf", "frontend-design", "skill-creator"]);

describe("cleanSplit", () => {
  it("normalises names and suffixes duplicates", () => {
    const result = cleanSplit(
      { customSkills: [{ name: "Board Update", purpose: "Monthly board update." }, { name: "board-update", purpose: "Another one." }], catalogMatches: [] },
      ACTIVE,
    );
    expect(result.customSkills).toEqual([
      { name: "board-update", purpose: "Monthly board update." },
      { name: "board-update-2", purpose: "Another one." },
    ]);
  });

  it("keeps at most 8 custom skills and 6 catalog matches", () => {
    const result = cleanSplit(
      {
        customSkills: Array.from({ length: 10 }, (_, i) => ({ name: `Skill ${i}`, purpose: `Does ${i}.` })),
        catalogMatches: [...ACTIVE].map((slug) => ({ slug, why: "Helps." })),
      },
      ACTIVE,
    );
    expect(result.customSkills).toHaveLength(8);
    expect(result.catalogMatches).toHaveLength(6);
  });

  it("drops catalog slugs that are not active, and repeated slugs", () => {
    const result = cleanSplit(
      { customSkills: [], catalogMatches: [{ slug: "ghost", why: "x" }, { slug: "pptx", why: "Decks." }, { slug: "pptx", why: "Again." }] },
      ACTIVE,
    );
    expect(result.catalogMatches).toEqual([{ slug: "pptx", why: "Decks." }]);
  });

  it("collapses whitespace, falls back to the name for an empty purpose, and skips empty entries", () => {
    const result = cleanSplit(
      { customSkills: [{ name: "Inbox  Triage", purpose: "  " }, { name: " ", purpose: " " }, { name: "", purpose: "Writes the\nweekly plan." }], catalogMatches: [] },
      ACTIVE,
    );
    expect(result.customSkills).toEqual([
      { name: "inbox-triage", purpose: "Inbox Triage" },
      { name: "writes-the-weekly-plan", purpose: "Writes the weekly plan." },
    ]);
  });
});
