import { describe, expect, it } from "vitest";
import { extractDocx } from "./docx";
import { buildDocx, DEFAULT_DOCX_STYLES } from "./fixtures";
import { openOoxml } from "./ooxml";

const facts = (opts: Parameters<typeof buildDocx>[0] = {}) => extractDocx(openOoxml(buildDocx(opts)));

describe("extractDocx", () => {
  it("reads the document defaults and theme", () => {
    const f = facts({ defaults: { font: "Inter", sizePt: 10.5 }, theme: { colors: { accent1: "1F4E79" }, majorFont: "Georgia" } });
    expect(f.kind).toBe("DOCX");
    expect(f.defaults).toEqual({ font: "Inter", sizePt: 10.5 });
    expect(f.theme?.majorFont).toBe("Georgia");
    expect(f.theme?.colors.find((c) => c.slot === "accent1")?.hex).toBe("#1F4E79");
  });

  it("reads each style's font, size, colour, weight and parent; 'auto' colour is no colour", () => {
    const f = facts({ paragraphs: [{ text: "A quote", style: "Quote" }] });
    expect(f.styles.find((s) => s.id === "Heading1")).toEqual({
      id: "Heading1",
      name: "heading 1",
      type: "paragraph",
      basedOn: "Normal",
      font: "Georgia",
      sizePt: 16,
      color: "#2F5496",
      bold: true,
    });
    expect(f.styles.find((s) => s.id === "Quote")).toMatchObject({ color: null, bold: false, font: null, sizePt: null });
  });

  it("keeps styles the document uses plus Normal, Title and Heading1-6, at most 40", () => {
    const extra = Array.from({ length: 50 }, (_, i) => ({ id: `Custom${i}`, name: `Custom ${i}` }));
    const f = facts({
      styles: [...DEFAULT_DOCX_STYLES, ...extra],
      paragraphs: [{ text: "Uses one custom style", style: "Custom3" }],
    });
    expect(f.styles.map((s) => s.id)).toEqual(["Normal", "Title", "Heading1", "Heading2", "Custom3"]);

    const many = facts({ styles: extra, paragraphs: extra.map((s) => ({ text: s.name, style: s.id })) });
    expect(many.styles).toHaveLength(40);
    expect(many.truncated).toBe(true);
  });

  it("lists headings with levels, Title as 0, and matches custom styles named 'heading N'", () => {
    const f = facts({
      styles: [...DEFAULT_DOCX_STYLES, { id: "MyHeading", name: "heading 2" }],
      paragraphs: [
        { text: "Board update", style: "Title" },
        { text: "Summary", style: "Heading1" },
        { text: "Revenue", style: "MyHeading" },
        { text: "Plain text" },
      ],
    });
    expect(f.headings).toEqual([
      { level: 0, text: "Board update" },
      { level: 1, text: "Summary" },
      { level: 2, text: "Revenue" },
    ]);
  });

  it("counts paragraphs, tables and images and reads the page from the last section", () => {
    const f = facts({ paragraphs: [{ text: "One" }, { text: "Two" }], tables: 2, images: 1, page: { widthIn: 11.69, heightIn: 8.27, orientation: "landscape" } });
    expect(f.paragraphs).toBe(5);
    expect(f.tables).toBe(2);
    expect(f.images).toBe(1);
    expect(f.page).toEqual({ widthIn: 11.69, heightIn: 8.27, orientation: "landscape" });
    expect(facts().page).toEqual({ widthIn: 8.5, heightIn: 11, orientation: "portrait" });
  });

  it("keeps a text sample of at most 4000 characters", () => {
    const f = facts({ paragraphs: Array.from({ length: 200 }, (_, i) => ({ text: `Paragraph ${i} ${"word ".repeat(10)}` })) });
    expect(f.textSample.length).toBe(4000);
    expect(f.textSample.startsWith("Paragraph 0 word")).toBe(true);
    expect(f.truncated).toBe(true);
    expect(facts().textSample).toBe("Monthly board update\nSummary\nRevenue grew 12% against plan.");
  });

  it("returns empty facts instead of throwing when the parts are missing", () => {
    expect(extractDocx({ names: [], parts: new Map(), truncated: false })).toMatchObject({ styles: [], headings: [], paragraphs: 0, page: null, textSample: "" });
  });
});
