import { describe, expect, it, vi, beforeEach } from "vitest";

const { invitationFindUnique, invitationUpdate, formFindUnique, invitationCreate } = vi.hoisted(() => ({
  invitationFindUnique: vi.fn(),
  invitationUpdate: vi.fn(),
  formFindUnique: vi.fn(),
  invitationCreate: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    formInvitation: { findUnique: invitationFindUnique, update: invitationUpdate, create: invitationCreate },
    form: { findUnique: formFindUnique },
    $transaction: (ops: unknown[]) => Promise.all(ops),
  },
}));

import { getInvitationForFilling, createInvitations } from "./invitations";

beforeEach(() => {
  invitationFindUnique.mockReset();
  invitationUpdate.mockReset();
  formFindUnique.mockReset();
  invitationCreate.mockReset();
});

describe("getInvitationForFilling", () => {
  it("rejects a viewer the invitation is not addressed to", async () => {
    invitationFindUnique.mockResolvedValue({ id: "inv1", recipientUserId: "someone-else", status: "SENT" });
    await expect(getInvitationForFilling({ id: "u1", role: "MENTEE" }, "inv1")).rejects.toThrow(/not addressed/i);
  });

  it("flips SENT to OPENED on first view", async () => {
    invitationFindUnique.mockResolvedValue({ id: "inv1", recipientUserId: "u1", status: "SENT", form: { sections: [] } });
    const invitation = await getInvitationForFilling({ id: "u1", role: "MENTEE" }, "inv1");
    expect(invitationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "inv1" }, data: expect.objectContaining({ status: "OPENED" }) })
    );
    expect(invitation.status).toBe("OPENED");
  });
});

describe("createInvitations", () => {
  it("rejects sending an unpublished form", async () => {
    formFindUnique.mockResolvedValue({ id: "f1", status: "DRAFT" });
    await expect(
      createInvitations({ id: "staff1", role: "MENTOR" }, { formId: "f1", recipientUserIds: ["u1"] })
    ).rejects.toThrow(/published/i);
  });

  it("creates one invitation per recipient", async () => {
    formFindUnique.mockResolvedValue({ id: "f1", status: "PUBLISHED" });
    invitationCreate.mockResolvedValue({ id: "inv1" });
    const result = await createInvitations({ id: "staff1", role: "MENTOR" }, {
      formId: "f1",
      recipientUserIds: ["u1", "u2"],
      groupId: "g1",
    });
    expect(invitationCreate).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);
  });
});
