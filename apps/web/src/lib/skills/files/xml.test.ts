import { describe, expect, it } from "vitest";
import { attr, collapse, decodeXml, elements, first, textOf } from "./xml";

describe("xml scanner", () => {
  it("matches elements by local name whatever their prefix, open or self-closing", () => {
    const xml = '<p:sp><a:t>One</a:t></p:sp><t>Two</t><a:t/><a:tbl><a:tblPr/></a:tbl>';
    expect(elements(xml, "t").map((e) => [e.name, e.inner])).toEqual([
      ["a:t", "One"],
      ["t", "Two"],
      ["a:t", ""],
    ]);
    expect(elements(xml, "tbl")).toHaveLength(1);
    expect(elements(xml, "tblPr")).toHaveLength(1);
  });

  it("parses attributes with either quote and decodes entities in them", () => {
    const el = first(`<w:style w:type="paragraph" w:styleId='Q&amp;A' name="&quot;x&quot; &#65;&#x42;"/>`, "style");
    expect(el?.attrs).toEqual({ "w:type": "paragraph", "w:styleId": "Q&A", name: '"x" AB' });
    expect(attr(el, "styleId")).toBe("Q&A");
    expect(attr(el, "w:type")).toBe("paragraph");
    expect(attr(el, "missing")).toBeNull();
    expect(attr(null, "x")).toBeNull();
  });

  it("prefers the exact attribute name, so r:id and id stay distinct", () => {
    const el = first('<p:sldId id="256" r:id="rId2"/>', "sldId");
    expect(attr(el, "id")).toBe("256");
    expect(attr(el, "r:id")).toBe("rId2");
  });

  it("keeps the inner XML of nested different tags", () => {
    const el = first('<p:sp><p:nvSpPr><p:ph type="title"/></p:nvSpPr><p:txBody><a:p><a:t>Hi</a:t></a:p></p:txBody></p:sp>', "sp");
    expect(attr(first(el!.inner, "ph"), "type")).toBe("title");
    expect(textOf(el!.inner)).toBe("Hi");
  });

  it("decodes the predefined and numeric entities only", () => {
    expect(decodeXml("a &lt;b&gt; &amp; &apos;c&apos; &#233; &#x1F600; &unknown;")).toBe("a <b> & 'c' é 😀 &unknown;");
  });

  it("joins text runs and collapses whitespace", () => {
    expect(textOf("<w:r><w:t>Hel</w:t></w:r><w:r><w:t>lo &amp; bye</w:t></w:r>")).toBe("Hello & bye");
    expect(collapse("  a \n\t b  ", 3)).toBe("a b");
  });
});
