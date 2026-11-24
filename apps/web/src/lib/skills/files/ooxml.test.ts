import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { buildPptx, themeXml, zip } from "./fixtures";
import { colorOf, openOoxml, partNumber, readTheme, relsPathFor, relTargets, toHex, topColors } from "./ooxml";
import { FileReadError } from "./types";
import { first } from "./xml";

describe("openOoxml", () => {
  it("reads XML and rels parts, lists every entry, and never inflates media", () => {
    const pkg = openOoxml(buildPptx({ padBytes: 1024 }));
    expect(pkg.names).toContain("ppt/media/pad.bin");
    expect(pkg.parts.has("ppt/media/pad.bin")).toBe(false);
    expect(pkg.parts.get("ppt/presentation.xml")).toContain("<p:sldSz");
    expect(pkg.parts.has("ppt/_rels/presentation.xml.rels")).toBe(true);
    expect(pkg.truncated).toBe(false);
  });

  it("skips a part whose declared size is over 16 MB and marks the package truncated", () => {
    const bytes = zipSync({
      "ppt/presentation.xml": strToU8("<p:presentation/>"),
      "ppt/slides/slide1.xml": new Uint8Array(17 * 1024 * 1024),
    });
    const pkg = openOoxml(bytes);
    expect(pkg.names).toContain("ppt/slides/slide1.xml");
    expect(pkg.parts.has("ppt/slides/slide1.xml")).toBe(false);
    expect(pkg.parts.has("ppt/presentation.xml")).toBe(true);
    expect(pkg.truncated).toBe(true);
  });

  it("refuses bytes that are not a readable zip", () => {
    const corrupt = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new Array(60).fill(7)]);
    const error = (() => {
      try {
        openOoxml(corrupt);
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(FileReadError);
    expect((error as FileReadError).code).toBe("FILE_UNREADABLE");
    expect((error as FileReadError).status).toBe(422);
  });

  it("skips customXml parts", () => {
    const pkg = openOoxml(zip({ "customXml/item1.xml": "<x/>", "word/document.xml": "<w:document/>" }));
    expect([...pkg.parts.keys()]).toEqual(["word/document.xml"]);
  });
});

describe("relationships", () => {
  const xml =
    '<Relationships><Relationship Id="rId1" Target="../slideLayouts/slideLayout2.xml"/><Relationship Id="rId2" Target="/ppt/media/a.png"/><Relationship Id="rId3" Target="https://x.test" TargetMode="External"/><Relationship Id="rId4" Target="./notes/n1.xml"/></Relationships>';

  it("resolves relative, ../ and absolute targets against the owning part, and drops external ones", () => {
    const map = relTargets(xml, "ppt/slides/slide1.xml");
    expect(map.get("rId1")).toBe("ppt/slideLayouts/slideLayout2.xml");
    expect(map.get("rId2")).toBe("ppt/media/a.png");
    expect(map.has("rId3")).toBe(false);
    expect(map.get("rId4")).toBe("ppt/slides/notes/n1.xml");
    expect(relTargets(undefined, "x.xml").size).toBe(0);
  });

  it("finds a part's rels path and number", () => {
    expect(relsPathFor("ppt/slides/slide12.xml")).toBe("ppt/slides/_rels/slide12.xml.rels");
    expect(partNumber("ppt/slides/slide12.xml")).toBe(12);
    expect(partNumber("ppt/presentation.xml")).toBe(0);
  });
});

describe("colours and themes", () => {
  it("normalises hex and reads srgbClr or sysClr lastClr", () => {
    expect(toHex("1f4e79")).toBe("#1F4E79");
    expect(toHex("auto")).toBeNull();
    expect(toHex(null)).toBeNull();
    expect(colorOf(first('<a:dk1><a:srgbClr val="112233"/></a:dk1>', "dk1"))).toBe("#112233");
    expect(colorOf(first('<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>', "dk1"))).toBe("#000000");
    expect(colorOf(null)).toBeNull();
  });

  it("reads all twelve slots, the name and the major and minor fonts", () => {
    const theme = readTheme(themeXml({ name: "Acme", colors: { accent1: "1F4E79" }, sysDk1: true, majorFont: "Georgia", minorFont: "Inter" }));
    expect(theme?.name).toBe("Acme");
    expect(theme?.colors.map((c) => c.slot)).toEqual(["dk1", "lt1", "dk2", "lt2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"]);
    expect(theme?.colors.find((c) => c.slot === "accent1")?.hex).toBe("#1F4E79");
    expect(theme?.colors.find((c) => c.slot === "dk1")?.hex).toBe("#000000");
    expect(theme?.majorFont).toBe("Georgia");
    expect(theme?.minorFont).toBe("Inter");
    expect(readTheme(undefined)).toBeNull();
  });

  it("counts explicit colours, most used first", () => {
    const used = topColors(['<a:srgbClr val="ff0000"/><a:srgbClr val="00FF00"/>', '<a:srgbClr val="FF0000"/><a:srgbClr val="zz"/>'], 1);
    expect(used).toEqual([{ hex: "#FF0000", count: 2 }]);
  });
});
