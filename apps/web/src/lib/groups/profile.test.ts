import { describe, expect, it } from "vitest";
import { dateHeading, groupByDate } from "@/lib/chat/date-groups";
import { clampLimit, extractLinks, isMediaMimeType, isSharedKind, memberRoleLabel } from "./profile";

describe("extractLinks", () => {
  it("finds http and https links and derives the domain", () => {
    expect(extractLinks("Read https://www.example.com/docs/start?x=1 and http://sub.site.org/a")).toEqual([
      { url: "https://www.example.com/docs/start?x=1", domain: "example.com" },
      { url: "http://sub.site.org/a", domain: "sub.site.org" },
    ]);
  });

  it("drops trailing sentence punctuation and brackets", () => {
    expect(extractLinks("(see https://example.com/page), or https://example.com/x.")).toEqual([
      { url: "https://example.com/page", domain: "example.com" },
      { url: "https://example.com/x", domain: "example.com" },
    ]);
  });

  it("never returns non-web schemes and collapses repeats within a message", () => {
    expect(extractLinks("javascript:alert(1) data:text/html,hi file:///etc/passwd")).toEqual([]);
    expect(extractLinks("https://a.io/p https://a.io/p https://a.io/p")).toHaveLength(1);
  });

  it("handles messages with no links, empty text and unicode hosts", () => {
    expect(extractLinks("")).toEqual([]);
    expect(extractLinks("no links here")).toEqual([]);
    expect(extractLinks("see https://example.com/path ok")[0].domain).toBe("example.com");
  });
});

describe("shared-content helpers", () => {
  it("splits media from documents by MIME type", () => {
    expect(isMediaMimeType("image/png")).toBe(true);
    expect(isMediaMimeType("video/mp4")).toBe(true);
    expect(isMediaMimeType("application/pdf")).toBe(false);
    expect(isMediaMimeType("audio/mpeg")).toBe(false);
    expect(isMediaMimeType("")).toBe(false);
  });

  it("maps owners and mentors to Admin and everyone else to Participant", () => {
    expect(memberRoleLabel("OWNER")).toBe("Admin");
    expect(memberRoleLabel("MENTOR")).toBe("Admin");
    expect(memberRoleLabel("MENTEE")).toBe("Participant");
  });

  it("validates kinds and clamps limits", () => {
    expect(isSharedKind("media")).toBe(true);
    expect(isSharedKind("videos")).toBe(false);
    expect(isSharedKind(null)).toBe(false);
    expect(clampLimit(null)).toBe(30);
    expect(clampLimit("0")).toBe(30);
    expect(clampLimit("abc")).toBe(30);
    expect(clampLimit("500")).toBe(50);
    expect(clampLimit("12")).toBe(12);
  });
});

describe("date headings", () => {
  const now = new Date(2026, 9, 12, 15, 30); // 12 Oct 2026, local time

  it("labels today, yesterday and older dates by month and year", () => {
    expect(dateHeading(new Date(2026, 9, 12, 0, 5), now)).toBe("Today");
    expect(dateHeading(new Date(2026, 9, 11, 23, 59), now)).toBe("Yesterday");
    expect(dateHeading(new Date(2026, 9, 10), now)).toBe("October 2026");
    expect(dateHeading(new Date(2026, 7, 3), now)).toBe("August 2026");
    expect(dateHeading(new Date(2025, 11, 31), now)).toBe("December 2025");
  });

  it("groups a newest-first list under contiguous headings and keeps order", () => {
    const items = [
      { id: "a", at: new Date(2026, 9, 12, 14) },
      { id: "b", at: new Date(2026, 9, 12, 9) },
      { id: "c", at: new Date(2026, 9, 11, 20) },
      { id: "d", at: new Date(2026, 8, 30) },
      { id: "e", at: new Date(2026, 8, 2) },
    ];
    const groups = groupByDate(items, (i) => i.at, now);
    expect(groups.map((g) => [g.heading, g.items.map((i) => i.id)])).toEqual([
      ["Today", ["a", "b"]],
      ["Yesterday", ["c"]],
      ["September 2026", ["d", "e"]],
    ]);
  });

  it("copes with ISO strings, invalid dates and empty lists", () => {
    expect(groupByDate([], (x: string) => x, now)).toEqual([]);
    expect(groupByDate(["not-a-date"], (x) => x, now)[0].heading).toBe("Unknown date");
    expect(groupByDate([new Date(2026, 9, 12, 8).toISOString()], (x) => x, now)[0].heading).toBe("Today");
  });
});
