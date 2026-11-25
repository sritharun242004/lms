import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ jobFindFirst: vi.fn(), consumeAiUsage: vi.fn(), enhanceTaskBrief: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { skillJob: { findFirst: mocks.jobFindFirst } } }));
vi.mock("@/lib/ai/usage", () => ({ consumeAiUsage: mocks.consumeAiUsage }));
vi.mock("@/lib/ai/claude", () => ({ enhanceTaskBrief: mocks.enhanceTaskBrief }));

import { enhanceTask } from "./enhance";
import { EnhanceInputTooShortError, JobNotFoundError } from "./errors";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.jobFindFirst.mockResolvedValue({ id: "j1", title: "Client SLA", description: "saved text" });
  mocks.enhanceTaskBrief.mockResolvedValue("## Purpose\nI write SLAs.");
});

describe("enhanceTask", () => {
  it("spends one unit, then sends the box text (not the saved one) with the title", async () => {
    mocks.enhanceTaskBrief.mockImplementation(async (message: string) => {
      expect(mocks.consumeAiUsage).toHaveBeenCalledWith("u1", "skill_enhance");
      expect(message).toContain("title: Client SLA");
      expect(message).toContain("I write an SLA for each new client");
      expect(message).not.toContain("saved text");
      return "## Purpose\nI write SLAs.";
    });
    expect(await enhanceTask("j1", "u1", "I write an SLA for each new client")).toEqual({ brief: "## Purpose\nI write SLAs." });
    expect(mocks.jobFindFirst.mock.calls[0][0].where).toEqual({ id: "j1", userId: "u1" });
  });

  it("needs five words before spending anything", async () => {
    await expect(enhanceTask("j1", "u1", "  four  short words here ")).rejects.toBeInstanceOf(EnhanceInputTooShortError);
    expect(mocks.consumeAiUsage).not.toHaveBeenCalled();
    expect(mocks.enhanceTaskBrief).not.toHaveBeenCalled();
  });

  it("refuses someone else's task", async () => {
    mocks.jobFindFirst.mockResolvedValue(null);
    await expect(enhanceTask("j1", "u2", "one two three four five")).rejects.toBeInstanceOf(JobNotFoundError);
    expect(mocks.consumeAiUsage).not.toHaveBeenCalled();
  });
});
