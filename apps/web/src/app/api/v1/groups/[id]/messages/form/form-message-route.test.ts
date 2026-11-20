import { NextRequest } from "next/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

const { getCurrentUser, getGroupAccess, sendFormToGroup, findUniqueOrThrow, broadcastToGroup } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getGroupAccess: vi.fn(),
  sendFormToGroup: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  broadcastToGroup: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/groups/access", () => ({ getGroupAccess }));
vi.mock("@/lib/forms/invitations", () => ({ sendFormToGroup }));
vi.mock("@/lib/forms/form-service", () => ({
  FormError: class FormError extends Error {
    constructor(message: string, public code: string, public status: number) {
      super(message);
    }
  },
}));
vi.mock("@/lib/realtime/broadcast", () => ({ broadcastToGroup }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { message: { findUniqueOrThrow } },
}));

import { POST } from "./route";

beforeEach(() => {
  getCurrentUser.mockReset();
  getGroupAccess.mockReset();
  sendFormToGroup.mockReset();
  findUniqueOrThrow.mockReset();
  broadcastToGroup.mockReset();
});

describe("POST /api/v1/groups/[id]/messages/form", () => {
  it("rejects a viewer who cannot manage the group", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTEE" });
    getGroupAccess.mockResolvedValue({ canView: true, canManage: false });
    const req = new NextRequest("http://localhost", { method: "POST", body: JSON.stringify({ formId: "f1" }) });
    const res = await POST(req, { params: Promise.resolve({ id: "g1" }) });
    expect(res.status).toBe(403);
  });

  it("sends the form and broadcasts the new message", async () => {
    getCurrentUser.mockResolvedValue({ id: "staff1", role: "MENTOR" });
    getGroupAccess.mockResolvedValue({ canView: true, canManage: true });
    sendFormToGroup.mockResolvedValue("msg1");
    findUniqueOrThrow.mockResolvedValue({
      id: "msg1",
      content: "Feedback",
      type: "FORM",
      groupId: "g1",
      senderId: "staff1",
      sender: { id: "staff1", name: "Staff", email: null, role: "MENTOR", avatarUrl: null, status: "ONLINE" },
      attachmentUrl: null,
      attachmentName: null,
      attachment: null,
      isPinned: false,
      isEdited: false,
      isDeleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      poll: null,
      openQuestion: null,
      wordCloud: null,
    });

    const req = new NextRequest("http://localhost", { method: "POST", body: JSON.stringify({ formId: "f1" }) });
    const res = await POST(req, { params: Promise.resolve({ id: "g1" }) });

    expect(res.status).toBe(201);
    expect(broadcastToGroup).toHaveBeenCalledWith("g1", "message:new", expect.objectContaining({ id: "msg1" }));
  });
});
