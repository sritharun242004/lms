import { NextRequest } from "next/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

const { getCurrentUser, listWhatsAppGroups, createWhatsAppGroup, updateWhatsAppGroup, deleteWhatsAppGroup } =
  vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    listWhatsAppGroups: vi.fn(),
    createWhatsAppGroup: vi.fn(),
    updateWhatsAppGroup: vi.fn(),
    deleteWhatsAppGroup: vi.fn(),
  }));

vi.mock("@/lib/auth", () => ({ getCurrentUser }));

vi.mock("@/lib/workshop/whatsapp-groups", () => ({
  listWhatsAppGroups,
  createWhatsAppGroup,
  updateWhatsAppGroup,
  deleteWhatsAppGroup,
  WhatsAppGroupError: class WhatsAppGroupError extends Error {
    constructor(message: string, public code: string, public status: number) {
      super(message);
    }
  },
}));

import { GET, POST } from "./route";
import { PATCH, DELETE } from "./[id]/route";

beforeEach(() => {
  getCurrentUser.mockReset();
  listWhatsAppGroups.mockReset();
  createWhatsAppGroup.mockReset();
  updateWhatsAppGroup.mockReset();
  deleteWhatsAppGroup.mockReset();
});

describe("GET /api/v1/admin/whatsapp-groups", () => {
  it("returns 403 for a non-admin", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTEE" });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns the group list for an admin", async () => {
    getCurrentUser.mockResolvedValue({ id: "admin1", role: "ADMIN" });
    listWhatsAppGroups.mockResolvedValue([{ id: "g1", name: "Day 1" }]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.groups).toHaveLength(1);
  });
});

describe("POST /api/v1/admin/whatsapp-groups", () => {
  it("returns 403 for a non-admin", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTEE" });
    const res = await POST(new NextRequest("http://localhost", { method: "POST", body: "{}" }));
    expect(res.status).toBe(403);
  });

  it("creates a group for an admin", async () => {
    getCurrentUser.mockResolvedValue({ id: "admin1", role: "ADMIN" });
    createWhatsAppGroup.mockResolvedValue({ id: "g1", name: "Day 1", inviteUrl: "https://wa.me/919876543210" });
    const req = new NextRequest("http://localhost", {
      method: "POST",
      body: JSON.stringify({ name: "Day 1", inviteUrl: "https://wa.me/919876543210" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
  });

  it("surfaces a validation error with the service's status code", async () => {
    const { WhatsAppGroupError } = await import("@/lib/workshop/whatsapp-groups");
    getCurrentUser.mockResolvedValue({ id: "admin1", role: "ADMIN" });
    createWhatsAppGroup.mockRejectedValue(new WhatsAppGroupError("Group name is required", "VALIDATION_ERROR", 400));
    const req = new NextRequest("http://localhost", { method: "POST", body: JSON.stringify({}) });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/v1/admin/whatsapp-groups/[id]", () => {
  it("returns 403 for a non-admin", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTEE" });
    const req = new NextRequest("http://localhost", { method: "PATCH", body: "{}" });
    const res = await PATCH(req, { params: Promise.resolve({ id: "g1" }) });
    expect(res.status).toBe(403);
  });

  it("deactivates a group for an admin", async () => {
    getCurrentUser.mockResolvedValue({ id: "admin1", role: "ADMIN" });
    updateWhatsAppGroup.mockResolvedValue({ id: "g1", isActive: false });
    const req = new NextRequest("http://localhost", { method: "PATCH", body: JSON.stringify({ isActive: false }) });
    const res = await PATCH(req, { params: Promise.resolve({ id: "g1" }) });
    expect(res.status).toBe(200);
    expect(updateWhatsAppGroup).toHaveBeenCalledWith("g1", { isActive: false });
  });
});

describe("DELETE /api/v1/admin/whatsapp-groups/[id]", () => {
  it("returns 403 for a non-admin", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTEE" });
    const res = await DELETE(new NextRequest("http://localhost", { method: "DELETE" }), { params: Promise.resolve({ id: "g1" }) });
    expect(res.status).toBe(403);
  });

  it("deletes a group for an admin", async () => {
    getCurrentUser.mockResolvedValue({ id: "admin1", role: "ADMIN" });
    deleteWhatsAppGroup.mockResolvedValue(undefined);
    const res = await DELETE(new NextRequest("http://localhost", { method: "DELETE" }), { params: Promise.resolve({ id: "g1" }) });
    expect(res.status).toBe(200);
    expect(deleteWhatsAppGroup).toHaveBeenCalledWith("g1");
  });
});
