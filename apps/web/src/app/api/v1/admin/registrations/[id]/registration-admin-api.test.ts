import { NextRequest } from "next/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

const { getCurrentUser, findUnique, deleteRegistration, updateRegistration, createAuditLog } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  findUnique: vi.fn(),
  deleteRegistration: vi.fn(),
  updateRegistration: vi.fn(),
  createAuditLog: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser }));

vi.mock("@/lib/db/prisma", () => {
  const tx = {
    workshopRegistration: { findUnique, delete: deleteRegistration, update: updateRegistration },
    auditLog: { create: createAuditLog },
  };
  return { prisma: { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) } };
});

import { DELETE, PATCH } from "./route";

const request = () => new NextRequest("http://localhost/api/v1/admin/registrations/r1", { method: "DELETE" });
const context = { params: Promise.resolve({ id: "r1" }) };

beforeEach(() => {
  getCurrentUser.mockReset();
  findUnique.mockReset();
  deleteRegistration.mockReset();
  updateRegistration.mockReset();
  createAuditLog.mockReset();
});

const patchRequest = (body: unknown) =>
  new NextRequest("http://localhost/api/v1/admin/registrations/r1", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
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

describe("PATCH /api/v1/admin/registrations/[id]", () => {
  it("returns 403 for a MENTOR and changes nothing", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTOR" });
    const res = await PATCH(patchRequest({ paid: true }), context);
    expect(res.status).toBe(403);
    expect(updateRegistration).not.toHaveBeenCalled();
  });

  it("rejects a body without a boolean paid flag", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", role: "ADMIN" });
    const res = await PATCH(patchRequest({ paid: "yes" }), context);
    expect(res.status).toBe(400);
    expect(updateRegistration).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown registration", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", role: "ADMIN" });
    findUnique.mockResolvedValue(null);
    const res = await PATCH(patchRequest({ paid: true }), context);
    expect(res.status).toBe(404);
    expect(updateRegistration).not.toHaveBeenCalled();
  });

  it("marks a pending registration paid with a fresh timestamp and audits it", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", role: "ADMIN" });
    findUnique.mockResolvedValue({ id: "r1", registrationCode: "XI-TEST", status: "PENDING_PAYMENT", paymentMarkedDoneAt: null });
    updateRegistration.mockResolvedValue({ id: "r1", status: "PAYMENT_DONE" });
    const res = await PATCH(patchRequest({ paid: true }), context);
    expect(res.status).toBe(200);
    const { data } = updateRegistration.mock.calls[0][0];
    expect(data.status).toBe("PAYMENT_DONE");
    expect(data.paymentMarkedDoneAt).toBeInstanceOf(Date);
    expect(createAuditLog.mock.calls[0][0].data).toMatchObject({
      action: "WORKSHOP_REGISTRATION_PAYMENT_UPDATED",
      entityId: "r1",
      metadata: { fromStatus: "PENDING_PAYMENT", toStatus: "PAYMENT_DONE" },
    });
  });

  it("keeps the participant's own Payment Done timestamp when marking paid", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", role: "ADMIN" });
    const clickedAt = new Date("2026-11-20T10:00:00Z");
    findUnique.mockResolvedValue({ id: "r1", registrationCode: "XI-TEST", status: "PAYMENT_DONE", paymentMarkedDoneAt: clickedAt });
    updateRegistration.mockResolvedValue({ id: "r1", status: "PAYMENT_DONE" });
    await PATCH(patchRequest({ paid: true }), context);
    expect(updateRegistration.mock.calls[0][0].data.paymentMarkedDoneAt).toBe(clickedAt);
  });

  it("marks a paid registration back to pending and clears the timestamp", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", role: "ADMIN" });
    findUnique.mockResolvedValue({ id: "r1", registrationCode: "XI-TEST", status: "PAYMENT_DONE", paymentMarkedDoneAt: new Date() });
    updateRegistration.mockResolvedValue({ id: "r1", status: "PENDING_PAYMENT" });
    const res = await PATCH(patchRequest({ paid: false }), context);
    expect(res.status).toBe(200);
    expect(updateRegistration.mock.calls[0][0].data).toEqual({ status: "PENDING_PAYMENT", paymentMarkedDoneAt: null });
  });
});
