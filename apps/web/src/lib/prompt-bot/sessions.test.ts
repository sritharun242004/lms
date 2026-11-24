// apps/web/src/lib/prompt-bot/sessions.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { promptMatrix: { findMany: mocks.findMany } } }));
vi.mock("@/lib/ai/claude", () => ({ scoreQuestions: vi.fn(), detectTaskKind: vi.fn() }));
vi.mock("@/lib/ai/usage", () => ({ consumeAiUsage: vi.fn() }));

import { matricesForSession, titleFrom } from "./sessions";

beforeEach(() => vi.clearAllMocks());

describe("matricesForSession", () => {
  it("returns core first, then the active task matrix, with only active questions", async () => {
    mocks.findMany.mockResolvedValue([
      { id: "pbm_image", slug: "image", name: "Image", kind: "TASK", questions: [{ id: "i1", text: "Why image?", guidance: "g", order: 0 }] },
      { id: "pbm_core", slug: "core", name: "Design Think", kind: "CORE", questions: [{ id: "c1", text: "Why?", guidance: "g", order: 0 }] },
    ]);
    const result = await matricesForSession("pbm_image");
    expect(result.map((m) => m.id)).toEqual(["pbm_core", "pbm_image"]);
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true, OR: [{ kind: "CORE" }, { id: "pbm_image" }] },
        include: { questions: { where: { isActive: true }, orderBy: { order: "asc" } } },
      }),
    );
  });

  it("drops a task matrix that has since been deactivated", async () => {
    mocks.findMany.mockResolvedValue([{ id: "pbm_core", slug: "core", name: "Design Think", kind: "CORE", questions: [] }]);
    expect((await matricesForSession("pbm_gone")).map((m) => m.id)).toEqual(["pbm_core"]);
  });
});

describe("titleFrom", () => {
  it("uses the first line of the prompt, trimmed to 80 characters", () => {
    expect(titleFrom("  Write a board update\nwith details")).toBe("Write a board update");
    expect(titleFrom("x".repeat(100))).toHaveLength(80);
    expect(titleFrom("   ")).toBe("Untitled prompt");
  });
});
