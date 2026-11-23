import { NextRequest } from "next/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

const { getCurrentUser, findUnique, deleteRegistration, createAuditLog } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  findUnique: vi.fn(),
  deleteRegistration: vi.fn(),
  createAuditLog: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser }));

vi.mock("@/lib/db/prisma", () => {
  const tx = {
    workshopRegistration: { findUnique, delete: deleteRegistration },
    auditLog: { create: createAuditLog },
  };
  return { prisma: { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) } };
});

import { DELETE } from "./route";

const request = () => new NextRequest("http://localhost/api/v1/admin/registrations/r1", { method: "DELETE" });
const context = { params: Promise.resolve({ id: "r1" }) };

beforeEach(() => {
  getCurrentUser.mockReset();
  findUnique.mockReset();
  deleteRegistration.mockReset();
  createAuditLog.mockReset();
});

describe("DELETE /api/v1/admin/registrations/[id]", () => {
  it("returns 403 for a MENTOR and deletes nothing", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTOR" });
    const res = await DELETE(request(), context);
    expect(res.status).toBe(403);
    expect(deleteRegistration).not.toHaveBeenCalled();
  });

  it("returns 403 when signed out", async () => {
    getCurrentUser.mockResolvedValue(null);
    const res = await DELETE(request(), context);
    expect(res.status).toBe(403);
    expect(deleteRegistration).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown registration", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", role: "ADMIN" });
    findUnique.mockResolvedValue(null);
    const res = await DELETE(request(), context);
    expect(res.status).toBe(404);
    expect(deleteRegistration).not.toHaveBeenCalled();
    expect(createAuditLog).not.toHaveBeenCalled();
  });

  it("deletes the registration and audits it without contact details", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", role: "ADMIN" });
    findUnique.mockResolvedValue({
      id: "r1",
      registrationCode: "XI-TEST",
      fullName: "Test Person",
      email: "test@example.com",
      whatsappNumber: "9999999999",
      workshopPackage: "DAY1",
      status: "PENDING_PAYMENT",
      amountInInr: 1000,
    });
    const res = await DELETE(request(), context);
    expect(res.status).toBe(200);
    expect(deleteRegistration).toHaveBeenCalledWith({ where: { id: "r1" } });
    const audit = createAuditLog.mock.calls[0][0].data;
    expect(audit).toMatchObject({
      userId: "u1",
      action: "WORKSHOP_REGISTRATION_DELETED",
      entityType: "WorkshopRegistration",
      entityId: "r1",
    });
    expect(JSON.stringify(audit.metadata)).not.toContain("test@example.com");
    expect(JSON.stringify(audit.metadata)).not.toContain("9999999999");
  });
});
