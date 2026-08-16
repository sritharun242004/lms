import { describe, expect, it } from "vitest";
import {
  applyMemberCount,
  friendlyUploadError,
  isFocusedGroupPath,
  isSupportedChatFile,
  normalizeQuizDraft,
  visibleRoleLabel,
} from "./task-requirements";

describe("focused group navigation", () => {
  it("hides application chrome only inside a specific group", () => {
    expect(isFocusedGroupPath("/chat/group-123")).toBe(true);
    expect(isFocusedGroupPath("/chat")).toBe(false);
    expect(isFocusedGroupPath("/dashboard")).toBe(false);
  });
});

describe("participant terminology", () => {
  it("does not expose mentor or mentee role names", () => {
    expect(visibleRoleLabel("MENTOR")).toBe("Participant");
    expect(visibleRoleLabel("MENTEE")).toBe("Participant");
    expect(visibleRoleLabel("ADMIN")).toBe("Super Admin");
  });
});

describe("chat uploads", () => {
  it("accepts a non-empty ZIP archive within the 50 MB limit", () => {
    expect(isSupportedChatFile({ name: "resources.zip", size: 35 * 1024 * 1024 })).toEqual({ ok: true });
  });

  it("returns a clear size error before attempting an oversized upload", () => {
    expect(isSupportedChatFile({ name: "resources.zip", size: 51 * 1024 * 1024 })).toEqual({
      ok: false,
      message: "resources.zip is too large. The maximum file size is 50 MB.",
    });
  });

  it("replaces browser pattern errors with upload guidance", () => {
    expect(friendlyUploadError("String pattern failed to match")).toBe(
      "The browser could not prepare this file. Rename it using simple letters and numbers, then try again."
    );
  });
});

describe("realtime participant counts", () => {
  it("uses the server membership count instead of incrementing stale client state", () => {
    expect(applyMemberCount(4, { groupId: "g1", memberCount: 5 }, "g1")).toBe(5);
    expect(applyMemberCount(4, { groupId: "g2", memberCount: 8 }, "g1")).toBe(4);
  });
});

describe("named quiz repository", () => {
  it("normalizes a reusable quiz while preserving all choices", () => {
    expect(
      normalizeQuizDraft({
        name: "  Product knowledge  ",
        question: "  Which plan includes exports?  ",
        options: [" Basic ", "Pro", "", "  Enterprise  "],
        chartType: "DONUT",
      })
    ).toEqual({
      name: "Product knowledge",
      question: "Which plan includes exports?",
      options: ["Basic", "Pro", "Enterprise"],
      chartType: "DONUT",
    });
  });

  it("rejects unnamed quizzes and quizzes with fewer than two choices", () => {
    expect(() => normalizeQuizDraft({ name: "", question: "Question", options: ["One"] })).toThrow();
  });
});
