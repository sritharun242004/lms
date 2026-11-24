import { describe, expect, it } from "vitest";
import { buildPptx, type FixtureSlide } from "./fixtures";
import { openOoxml } from "./ooxml";
import { extractPptx } from "./pptx";

const facts = (opts: Parameters<typeof buildPptx>[0] = {}) => extractPptx(openOoxml(buildPptx(opts)));

describe("extractPptx", () => {
  it("reads the slide size, theme, masters and layouts", () => {
    const f = facts({ theme: { name: "Acme", colors: { accent1: "1F4E79" }, majorFont: "Georgia", minorFont: "Inter" } });
    expect(f.kind).toBe("PPTX");
    expect(f.slideSize).toEqual({ widthIn: 13.33, heightIn: 7.5, aspect: "16:9" });
    expect(f.theme?.colors.find((c) => c.slot === "accent1")?.hex).toBe("#1F4E79");
    expect(f.theme?.majorFont).toBe("Georgia");
    expect(f.themes).toEqual(["Acme"]);
    expect(f.masters).toEqual(["Office Theme"]);
    expect(f.layouts).toEqual(["Title Slide", "Title and Content"]);
    expect(f.truncated).toBe(false);
  });

  it("names the aspect ratio: 4:3, PowerPoint's A4 and custom", () => {
    expect(facts({ slideSize: { cx: 9_144_000, cy: 6_858_000 } }).slideSize?.aspect).toBe("4:3");
    expect(facts({ slideSize: { cx: 9_906_000, cy: 6_858_000 } }).slideSize?.aspect).toBe("A4");
    expect(facts({ slideSize: { cx: 9_144_000, cy: 9_144_000 } }).slideSize).toEqual({ widthIn: 10, heightIn: 10, aspect: "custom" });
  });

  it("describes each slide: title from title or ctrTitle, placeholders, layout, text, tables, charts, pictures", () => {
    const f = facts({
      slides: [
        { title: "Board update", layout: 1 },
        { title: "Numbers", body: ["Revenue up", "Costs flat"], layout: 2, table: true, chart: true, picture: true },
      ],
    });
    expect(f.slideCount).toBe(2);
    expect(f.slides[0]).toEqual({ index: 1, layout: "Title Slide", title: "Board update", placeholders: ["ctrTitle"], text: "Board update", tables: 0, charts: 0, images: 0 });
    expect(f.slides[1]).toMatchObject({
      index: 2,
      layout: "Title and Content",
      title: "Numbers",
      placeholders: ["title", "body"],
      tables: 1,
      charts: 1,
      images: 1,
    });
    expect(f.slides[1].text).toBe("NumbersRevenue upCosts flatCell");
  });

  it("collects explicit colours and fonts, never the theme references", () => {
    const f = facts({
      slides: [
        { title: "A", body: ["b", "c"], colors: ["1F4E79", "1F4E79", "C00000"], fonts: ["Georgia", "+mn-lt", "Inter"] },
        { title: "D", colors: ["C00000"], fonts: ["+mj-lt"] },
      ],
    });
    expect(f.colorsUsed).toEqual([
      { hex: "#1F4E79", count: 2 },
      { hex: "#C00000", count: 2 },
    ]);
    expect(f.fontsUsed).toEqual(["Georgia", "Inter"]);
  });

  describe("real-world quirks (Review Focus 5)", () => {
    it("follows sldIdLst order, not the slide file numbers", () => {
      const slides: FixtureSlide[] = [{ title: "Stored first" }, { title: "Stored second" }, { title: "Stored third" }];
      const f = facts({ slides, order: [3, 1, 2] });
      expect(f.slides.map((s) => s.title)).toEqual(["Stored third", "Stored first", "Stored second"]);
      expect(f.slides.map((s) => s.index)).toEqual([1, 2, 3]);
    });

    it("reads a theme whose dark colour is a system colour", () => {
      expect(facts({ theme: { sysDk1: true, colors: { dk1: "0A0A0A" } } }).theme?.colors[0]).toEqual({ slot: "dk1", hex: "#0A0A0A" });
    });

    it("falls back to numbered names for masters and layouts without one (Google Slides exports)", () => {
      const f = facts({ masters: [null], layouts: [null, "Section"] });
      expect(f.masters).toEqual(["Master 1"]);
      expect(f.layouts).toEqual(["Layout 1", "Section"]);
    });

    it("keeps a slide that has no rels part, with no layout", () => {
      const f = facts({ slides: [{ title: "Loose", layout: 0 }] });
      expect(f.slides[0]).toMatchObject({ title: "Loose", layout: null });
    });

    it("falls back to slide part numbers when sldIdLst is missing", () => {
      const pkg = openOoxml(buildPptx({ slides: [{ title: "One" }, { title: "Two" }] }));
      pkg.parts.set("ppt/presentation.xml", '<p:presentation><p:sldSz cx="12192000" cy="6858000"/></p:presentation>');
      const f = extractPptx(pkg);
      expect(f.slideCount).toBe(2);
      expect(f.slides.map((s) => s.title)).toEqual(["One", "Two"]);
    });

    it("returns empty facts instead of throwing when the main parts are missing", () => {
      const f = extractPptx({ names: [], parts: new Map(), truncated: false });
      expect(f).toMatchObject({ slideSize: null, theme: null, slideCount: 0, slides: [], masters: [], layouts: [] });
    });
  });

  it("details the first 60 slides, counts them all and marks the facts truncated", () => {
    const slides = Array.from({ length: 61 }, (_, i) => ({ title: `Slide ${i + 1}` }));
    const f = facts({ slides });
    expect(f.slideCount).toBe(61);
    expect(f.slides).toHaveLength(60);
    expect(f.slides[59].title).toBe("Slide 60");
    expect(f.truncated).toBe(true);
  });
});
