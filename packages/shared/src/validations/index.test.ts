import { describe, expect, it } from "vitest";
import {
  loginSchema,
  menteeJoinSchema,
  resetPasswordSchema,
  sendMessageSchema,
  createPollSchema,
  createWordCloudSchema,
  submitWordSchema,
  searchSchema,
  paginationSchema,
} from "./index";
import { MAX_MESSAGE_LENGTH } from "../constants";

describe("loginSchema", () => {
  it("accepts a valid login", () => {
    const result = loginSchema.safeParse({ email: "a@b.com", password: "password123" });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = loginSchema.safeParse({ email: "not-an-email", password: "password123" });
    expect(result.success).toBe(false);
  });

  it("rejects a password under 8 characters", () => {
    const result = loginSchema.safeParse({ email: "a@b.com", password: "short" });
    expect(result.success).toBe(false);
  });

  it("defaults rememberMe to false when omitted", () => {
    const result = loginSchema.parse({ email: "a@b.com", password: "password123" });
    expect(result.rememberMe).toBe(false);
  });
});

describe("menteeJoinSchema", () => {
  it("uppercases the invite code", () => {
    const result = menteeJoinSchema.parse({ name: "Ann", inviteCode: "cms-ab12" });
    expect(result.inviteCode).toBe("CMS-AB12");
  });

  it("rejects a name shorter than 2 characters", () => {
    const result = menteeJoinSchema.safeParse({ name: "A", inviteCode: "CMS-AB12" });
    expect(result.success).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  const base = {
    token: "tok",
    password: "Passw0rd!",
    confirmPassword: "Passw0rd!",
  };

  it("accepts a password meeting every complexity rule", () => {
    expect(resetPasswordSchema.safeParse(base).success).toBe(true);
  });

  it("rejects mismatched confirmPassword", () => {
    const result = resetPasswordSchema.safeParse({ ...base, confirmPassword: "different" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["confirmPassword"]);
    }
  });

  it.each([
    ["missing uppercase", "passw0rd!"],
    ["missing lowercase", "PASSW0RD!"],
    ["missing digit", "Password!"],
    ["missing special char", "Passw0rdX"],
  ])("rejects a password %s", (_label, password) => {
    const result = resetPasswordSchema.safeParse({ ...base, password, confirmPassword: password });
    expect(result.success).toBe(false);
  });
});

describe("sendMessageSchema", () => {
  it("rejects empty content", () => {
    expect(sendMessageSchema.safeParse({ content: "" }).success).toBe(false);
  });

  it("defaults type to TEXT", () => {
    const result = sendMessageSchema.parse({ content: "hi" });
    expect(result.type).toBe("TEXT");
  });

  it("accepts a long multi-thousand-word message", () => {
    const result = sendMessageSchema.safeParse({ content: "word ".repeat(3000).trim() });
    expect(result.success).toBe(true);
  });

  it("rejects content over the max length", () => {
    const result = sendMessageSchema.safeParse({ content: "a".repeat(MAX_MESSAGE_LENGTH + 1) });
    expect(result.success).toBe(false);
  });
});

describe("createPollSchema", () => {
  it("requires at least 2 options", () => {
    const result = createPollSchema.safeParse({ question: "Favorite color?", options: ["Red"] });
    expect(result.success).toBe(false);
  });

  it("rejects more than 8 options", () => {
    const result = createPollSchema.safeParse({
      question: "Pick one",
      options: Array.from({ length: 9 }, (_, i) => `Option ${i}`),
    });
    expect(result.success).toBe(false);
  });

  it("defaults chartType to BAR", () => {
    const result = createPollSchema.parse({ question: "Q", options: ["A", "B"] });
    expect(result.chartType).toBe("BAR");
  });
});

describe("createWordCloudSchema", () => {
  it("applies defaults for optional fields", () => {
    const result = createWordCloudSchema.parse({ question: "Describe the workshop" });
    expect(result.maxWordsPerParticipant).toBe(1);
    expect(result.maxWordLength).toBe(30);
    expect(result.allowMultipleSubmissions).toBe(false);
    expect(result.profanityFilter).toBe(true);
  });

  it("coerces numeric strings from form data", () => {
    const result = createWordCloudSchema.parse({
      question: "Q",
      maxWordsPerParticipant: "3",
      maxWordLength: "20",
    });
    expect(result.maxWordsPerParticipant).toBe(3);
    expect(result.maxWordLength).toBe(20);
  });

  it("accepts a raised maxWordsPerParticipant", () => {
    const result = createWordCloudSchema.safeParse({ question: "Q", maxWordsPerParticipant: 25 });
    expect(result.success).toBe(true);
  });

  it("rejects maxWordsPerParticipant above 50", () => {
    const result = createWordCloudSchema.safeParse({ question: "Q", maxWordsPerParticipant: 51 });
    expect(result.success).toBe(false);
  });
});

describe("submitWordSchema", () => {
  it("rejects blank submissions", () => {
    expect(submitWordSchema.safeParse({ text: "   " }).success).toBe(false);
  });
});

describe("searchSchema / paginationSchema", () => {
  it("defaults search type/page/limit", () => {
    const result = searchSchema.parse({ query: "hello" });
    expect(result.type).toBe("all");
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it("caps pagination limit at 100", () => {
    expect(paginationSchema.safeParse({ limit: 500 }).success).toBe(false);
  });
});
