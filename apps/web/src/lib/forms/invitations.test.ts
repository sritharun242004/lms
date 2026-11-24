import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  invitationFindUnique,
  invitationUpdate,
  formFindUnique,
  invitationCreate,
  invitationCreateMany,
  groupMemberFindMany,
  messageCreate,
} = vi.hoisted(() => ({
  invitationFindUnique: vi.fn(),
  invitationUpdate: vi.fn(),
  formFindUnique: vi.fn(),
  invitationCreate: vi.fn(),
  invitationCreateMany: vi.fn(),
  groupMemberFindMany: vi.fn(),
  messageCreate: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    formInvitation: { findUnique: invitationFindUnique, update: invitationUpdate, create: invitationCreate, createMany: invitationCreateMany },
    form: { findUnique: formFindUnique },
    groupMember: { findMany: groupMemberFindMany },
    message: { create: messageCreate },
    $transaction: (arg: unknown) =>
      Array.isArray(arg)
        ? Promise.all(arg)
        : (arg as (tx: unknown) => unknown)({
            message: { create: messageCreate },
            formInvitation: { createMany: invitationCreateMany },
          }),
  },
}));

import { getInvitationForFilling, createInvitations, sendFormToGroup } from "./invitations";

beforeEach(() => {
  invitationFindUnique.mockReset();
  invitationUpdate.mockReset();
  formFindUnique.mockReset();
  invitationCreate.mockReset();
  invitationCreateMany.mockReset();
  groupMemberFindMany.mockReset();
  messageCreate.mockReset();
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

describe("sendFormToGroup", () => {
  it("rejects when the group has no participant members", async () => {
    formFindUnique.mockResolvedValue({ id: "f1", status: "PUBLISHED", title: "Feedback" });
    groupMemberFindMany.mockResolvedValue([]);
    await expect(
      sendFormToGroup({ id: "staff1", role: "MENTOR" }, "g1", "f1")
    ).rejects.toThrow(/no participants/i);
  });

  it("creates a FORM message and one invitation per MENTEE member", async () => {
    formFindUnique.mockResolvedValue({ id: "f1", status: "PUBLISHED", title: "Feedback" });
    groupMemberFindMany.mockResolvedValue([{ userId: "mentee1" }, { userId: "mentee2" }]);
    messageCreate.mockResolvedValue({ id: "msg1" });

    const messageId = await sendFormToGroup({ id: "staff1", role: "MENTOR" }, "g1", "f1");

    expect(messageCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "FORM", groupId: "g1", content: "Feedback" }) })
    );
    expect(invitationCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({ recipientUserId: "mentee1", messageId: "msg1" }),
          expect.objectContaining({ recipientUserId: "mentee2", messageId: "msg1" }),
        ],
      })
    );
    expect(messageId).toBe("msg1");
  });
});
