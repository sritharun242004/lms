import { describe, expect, it, vi, beforeEach } from "vitest";

const { create, findMany, findUnique, update, sectionFindUnique, questionCreate, aggregate } = vi.hoisted(() => ({
  create: vi.fn(),
  findMany: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  sectionFindUnique: vi.fn(),
  questionCreate: vi.fn(),
  aggregate: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    formQuestionTemplate: { create, findMany, findUnique, update },
    formSection: { findUnique: sectionFindUnique },
    formQuestion: { create: questionCreate, aggregate },
  },
}));

import {
  createQuestionTemplate,
  listQuestionTemplates,
  insertTemplateIntoSection,
} from "./question-templates";

beforeEach(() => {
  create.mockReset();
  findMany.mockReset();
  findUnique.mockReset();
  update.mockReset();
  sectionFindUnique.mockReset();
  questionCreate.mockReset();
  aggregate.mockReset();
});

describe("createQuestionTemplate", () => {
  it("rejects a blank title", async () => {
    await expect(
      createQuestionTemplate({ id: "u1", role: "MENTOR" }, { title: " ", type: "SHORT_ANSWER" })
    ).rejects.toThrow(/title/i);
  });

  it("rejects a MENTEE", async () => {
    await expect(
      createQuestionTemplate({ id: "u1", role: "MENTEE" }, { title: "Name", type: "SHORT_ANSWER" })
    ).rejects.toThrow(/staff/i);
  });

  it("creates a template owned by the actor", async () => {
    create.mockResolvedValue({ id: "t1", title: "Name" });
    await createQuestionTemplate({ id: "u1", role: "MENTOR" }, { title: "Name", type: "SHORT_ANSWER" });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ title: "Name", createdById: "u1" }) })
    );
  });
});

describe("listQuestionTemplates", () => {
  it("scopes non-admin staff to their own templates", async () => {
    findMany.mockResolvedValue([]);
    await listQuestionTemplates({ id: "u1", role: "MENTOR" }, {});
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ createdById: "u1" }) })
    );
  });

  it("does not scope ADMIN to a single owner", async () => {
    findMany.mockResolvedValue([]);
    await listQuestionTemplates({ id: "admin1", role: "ADMIN" }, {});
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.not.objectContaining({ createdById: "admin1" }) }));
  });
});

describe("insertTemplateIntoSection", () => {
  it("copies the template's fields into a new question at the next order", async () => {
    findUnique.mockResolvedValue({ id: "t1", type: "SHORT_ANSWER", title: "Name", description: null, config: { maxLength: 100 } });
    sectionFindUnique.mockResolvedValue({ id: "s1" });
    aggregate.mockResolvedValue({ _max: { order: 2 } });
    questionCreate.mockResolvedValue({ id: "q1", order: 3 });

    const question = await insertTemplateIntoSection({ id: "u1", role: "MENTOR" }, "t1", "s1");

    expect(questionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ templateId: "t1", sectionId: "s1", order: 3 }) })
    );
    expect(question.order).toBe(3);
  });

  it("throws when the template does not exist", async () => {
    findUnique.mockResolvedValue(null);
    await expect(insertTemplateIntoSection({ id: "u1", role: "MENTOR" }, "missing", "s1")).rejects.toThrow(/not found/i);
  });
});
