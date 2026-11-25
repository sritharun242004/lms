import { describe, expect, it } from "vitest";
import { checkSkillPath } from "../format";
import { assetFileName } from "./safe-name";

describe("assetFileName", () => {
  it("makes a lower-case, hyphenated name with the sniffed kind's extension", () => {
    expect(assetFileName("Q3 Board Deck (final).pptx", "PPTX", [])).toBe("q3-board-deck-final.pptx");
    expect(assetFileName("deck.PPTX.exe", "PPTX", [])).toBe("deck-pptx.pptx");
    expect(assetFileName("photo.jpeg", "JPEG", [])).toBe("photo.jpg");
    expect(assetFileName("scan.png", "PDF", [])).toBe("scan.pdf");
  });

  it("drops leading dots, path parts, accents, emoji and quotes (Review Focus 5)", () => {
    expect(assetFileName(".hidden.docx", "DOCX", [])).toBe("hidden.docx");
    expect(assetFileName("C:\\Users\\me\\..\\Brand.xlsx", "XLSX", [])).toBe("brand.xlsx");
    expect(assetFileName("../../etc/passwd", "PDF", [])).toBe("passwd.pdf");
    expect(assetFileName("📊 Café “Board” deck.pptx", "PPTX", [])).toBe("cafe-board-deck.pptx");
    expect(assetFileName("会議資料.pptx", "PPTX", [])).toBe("file.pptx");
    expect(assetFileName("", "PNG", [])).toBe("file.png");
  });

  it("keeps names at most 100 characters", () => {
    const name = assetFileName(`${"a".repeat(300)}.pptx`, "PPTX", Array.from({ length: 50 }, (_, i) => (i === 0 ? `${"a".repeat(80)}.pptx` : `${"a".repeat(80)}-${i + 1}.pptx`)));
    expect(name).toBe(`${"a".repeat(80)}-51.pptx`);
    expect(name.length).toBeLessThanOrEqual(100);
  });

  it("makes names unique case-insensitively", () => {
    expect(assetFileName("Deck.pptx", "PPTX", ["DECK.PPTX"])).toBe("deck-2.pptx");
    expect(assetFileName("Deck.pptx", "PPTX", ["deck.pptx", "deck-2.pptx"])).toBe("deck-3.pptx");
  });

  it("always produces a path the skill validator accepts", () => {
    for (const original of ["a.pptx", ".x", "--.pdf", "  spaced  out .docx", "émoji 🎉.png", "x".repeat(500), "con.xlsx", "SKILL.md"]) {
      const check = checkSkillPath(`assets/${assetFileName(original, "PDF", [])}`);
      expect(check.ok, original).toBe(true);
    }
  });
});
