import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  formFindUnique,
  formFindMany,
  formCreate,
  formUpdate,
  sectionCount,
  sectionDeleteMany,
  sectionCreate,
} = vi.hoisted(() => ({
  formFindUnique: vi.fn(),
  formFindMany: vi.fn(),
  formCreate: vi.fn(),
  formUpdate: vi.fn(),
  sectionCount: vi.fn(),
  sectionDeleteMany: vi.fn(),
  sectionCreate: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    form: { findUnique: formFindUnique, findMany: formFindMany, create: formCreate, update: formUpdate },
    formSection: { count: sectionCount, deleteMany: sectionDeleteMany, create: sectionCreate },
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({
        formSection: { deleteMany: sectionDeleteMany, create: sectionCreate },
      }),
  },
}));

import {
  createForm,
  requireStaff,
  setFormStatus,
  saveFormStructure,
  FormError,
} from "./form-service";

beforeEach(() => {
  formFindUnique.mockReset();
  formFindMany.mockReset();
  formCreate.mockReset();
  formUpdate.mockReset();
  sectionCount.mockReset();
  sectionDeleteMany.mockReset();
  sectionCreate.mockReset();
});

describe("requireStaff", () => {
  it("allows MENTOR and ADMIN", () => {
    expect(() => requireStaff({ id: "u1", role: "MENTOR" })).not.toThrow();
    expect(() => requireStaff({ id: "u1", role: "ADMIN" })).not.toThrow();
  });

  it("rejects MENTEE", () => {
    expect(() => requireStaff({ id: "u1", role: "MENTEE" })).toThrow(FormError);
  });
});

describe("createForm", () => {
  it("rejects an empty title", async () => {
    await expect(createForm({ id: "u1", role: "MENTOR" }, { title: "   " })).rejects.toThrow(/title/i);
  });

  it("creates a draft GENERIC form by default", async () => {
    formCreate.mockResolvedValue({ id: "f1", status: "DRAFT", category: "GENERIC" });
    const form = await createForm({ id: "u1", role: "MENTOR" }, { title: "Session feedback" });
    expect(formCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ title: "Session feedback", category: "GENERIC", createdById: "u1" }) })
    );
    expect(form.status).toBe("DRAFT");
  });
});

describe("setFormStatus", () => {
  it("rejects publishing a form with no sections", async () => {
    formFindUnique.mockResolvedValue({ id: "f1", createdById: "u1", status: "DRAFT" });
    sectionCount.mockResolvedValue(0);
    await expect(setFormStatus({ id: "u1", role: "MENTOR" }, "f1", "PUBLISHED")).rejects.toThrow(/at least one section/i);
  });

  it("allows DRAFT -> PUBLISHED when sections exist", async () => {
    formFindUnique.mockResolvedValue({ id: "f1", createdById: "u1", status: "DRAFT" });
    sectionCount.mockResolvedValue(1);
    formUpdate.mockResolvedValue({ id: "f1", status: "PUBLISHED" });
    const result = await setFormStatus({ id: "u1", role: "MENTOR" }, "f1", "PUBLISHED");
    expect(result.status).toBe("PUBLISHED");
  });

  it("rejects PUBLISHED -> DRAFT as an invalid transition", async () => {
    formFindUnique.mockResolvedValue({ id: "f1", createdById: "u1", status: "PUBLISHED" });
    await expect(setFormStatus({ id: "u1", role: "MENTOR" }, "f1", "DRAFT")).rejects.toThrow(/cannot move/i);
  });

  it("rejects a non-owner, non-admin staff member", async () => {
    formFindUnique.mockResolvedValue({ id: "f1", createdById: "someone-else", status: "DRAFT" });
    await expect(setFormStatus({ id: "u1", role: "MENTOR" }, "f1", "PUBLISHED")).rejects.toThrow(/access/i);
  });
});

describe("saveFormStructure", () => {
  it("rejects editing a published form's structure", async () => {
    formFindUnique.mockResolvedValue({ id: "f1", createdById: "u1", status: "PUBLISHED" });
    await expect(
      saveFormStructure({ id: "u1", role: "MENTOR" }, "f1", [])
    ).rejects.toThrow(/draft/i);
  });

  it("replaces sections and questions for a draft form", async () => {
    formFindUnique.mockResolvedValue({ id: "f1", createdById: "u1", status: "DRAFT" });
    await saveFormStructure({ id: "u1", role: "MENTOR" }, "f1", [
      { title: "Section 1", questions: [{ type: "SHORT_ANSWER", title: "Your name" }] },
    ]);
    expect(sectionDeleteMany).toHaveBeenCalledWith({ where: { formId: "f1" } });
    expect(sectionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          formId: "f1",
          order: 0,
          questions: { create: [expect.objectContaining({ type: "SHORT_ANSWER", title: "Your name", order: 0 })] },
        }),
      })
    );
  });
});
