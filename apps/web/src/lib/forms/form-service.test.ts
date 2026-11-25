import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  responseCount,
  invitationFindMany,
  messageUpdateMany,
  formDelete,
  auditCreate,
  formFindUnique,
  formFindMany,
  formCreate,
  formUpdate,
  sectionCount,
  sectionDeleteMany,
  sectionCreate,
} = vi.hoisted(() => ({
  responseCount: vi.fn(),
  invitationFindMany: vi.fn(),
  messageUpdateMany: vi.fn(),
  formDelete: vi.fn(),
  auditCreate: vi.fn(),
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
        formResponse: { count: responseCount },
        formInvitation: { findMany: invitationFindMany },
        message: { updateMany: messageUpdateMany },
        form: { delete: formDelete },
        auditLog: { create: auditCreate },
      }),
  },
}));

import {
  createForm,
  deleteForm,
  duplicateForm,
  listForms,
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

describe("templates", () => {
  const template = {
    id: "t1",
    title: "AI Empowerment for Teams Certificate",
    description: null,
    headerImageUrl: null,
    themeColor: null,
    category: "FEEDBACK",
    allowMultipleSubmissions: false,
    feedbackTargetType: null,
    feedbackTargetLabel: null,
    createdById: "admin1",
    isTemplate: true,
    sections: [],
  };

  it("lets any staff member use another person's template, keeping its title", async () => {
    formFindUnique.mockResolvedValue(template);
    formCreate.mockResolvedValue({ id: "f2" });
    await duplicateForm({ id: "mentor1", role: "MENTOR" }, "t1");
    const data = formCreate.mock.calls[0][0].data;
    expect(data.title).toBe("AI Empowerment for Teams Certificate");
    expect(data.createdById).toBe("mentor1");
    expect(data.status).toBe("DRAFT");
    expect(data).not.toHaveProperty("isTemplate");
    expect(data).not.toHaveProperty("publicLinkEnabled");
  });

  it("still blocks copying someone else's ordinary form", async () => {
    formFindUnique.mockResolvedValue({ ...template, isTemplate: false });
    await expect(duplicateForm({ id: "mentor1", role: "MENTOR" }, "t1")).rejects.toMatchObject({ status: 403 });
  });

  it("shows a mentor their own forms plus every template", async () => {
    formFindMany.mockResolvedValue([]);
    await listForms({ id: "mentor1", role: "MENTOR" }, {});
    expect(formFindMany.mock.calls[0][0].where).toMatchObject({
      OR: [{ createdById: "mentor1" }, { isTemplate: true }],
    });
  });
});

describe("deleteForm", () => {
  beforeEach(() => {
    [responseCount, invitationFindMany, messageUpdateMany, formDelete, auditCreate].forEach((m) => m.mockReset());
  });

  it("deletes the form, hides the chat messages that sent it, and audits it", async () => {
    formFindUnique.mockResolvedValue({ id: "f1", title: "Day 1 feedback", createdById: "u1", isTemplate: false, status: "PUBLISHED" });
    responseCount.mockResolvedValue(3);
    invitationFindMany.mockResolvedValue([{ messageId: "m1" }, { messageId: "m2" }]);

    await expect(deleteForm({ id: "u1", role: "MENTOR" }, "f1")).resolves.toEqual({ responseCount: 3 });

    expect(messageUpdateMany.mock.calls[0][0]).toMatchObject({
      where: { id: { in: ["m1", "m2"] }, isDeleted: false },
      data: { isDeleted: true, deletedById: "u1" },
    });
    expect(formDelete).toHaveBeenCalledWith({ where: { id: "f1" } });
    expect(auditCreate.mock.calls[0][0].data).toMatchObject({
      action: "FORM_DELETED",
      entityId: "f1",
      metadata: { title: "Day 1 feedback", responseCount: 3 },
    });
  });

  it("refuses another mentor's form, including a shared template", async () => {
    formFindUnique.mockResolvedValue({ id: "t1", title: "Template", createdById: "admin1", isTemplate: true, status: "DRAFT" });
    await expect(deleteForm({ id: "mentor1", role: "MENTOR" }, "t1")).rejects.toMatchObject({ status: 403 });
    expect(formDelete).not.toHaveBeenCalled();
  });

  it("lets an admin delete anyone's form", async () => {
    formFindUnique.mockResolvedValue({ id: "f1", title: "X", createdById: "mentor1", isTemplate: false, status: "DRAFT" });
    responseCount.mockResolvedValue(0);
    invitationFindMany.mockResolvedValue([]);
    await deleteForm({ id: "admin1", role: "ADMIN" }, "f1");
    expect(messageUpdateMany).not.toHaveBeenCalled();
    expect(formDelete).toHaveBeenCalled();
  });

  it("refuses participants outright", async () => {
    await expect(deleteForm({ id: "p1", role: "MENTEE" }, "f1")).rejects.toMatchObject({ status: 403 });
  });
});
