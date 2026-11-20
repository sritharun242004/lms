import { NextRequest } from "next/server";
import { describe, expect, it, vi, beforeEach } from "vitest";
import * as XLSX from "xlsx";

const { getCurrentUser, findMany } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { workshopRegistration: { findMany } } }));

import { GET } from "./route";

const row = {
  registrationCode: "XI-2026-0001",
  fullName: "Asha Rao",
  email: "asha@example.com",
  whatsappNumber: "+919876543210",
  registrationKind: "INDIVIDUAL",
  companyName: null,
  companyAddress: null,
  companyGstin: null,
  workshopPackage: "DAY1",
  amountInInr: 28250,
  status: "PAYMENT_DONE",
  paymentMarkedDoneAt: new Date("2026-11-20T10:00:00Z"),
  createdAt: new Date("2026-11-20T09:00:00Z"),
};

beforeEach(() => {
  getCurrentUser.mockReset();
  findMany.mockReset();
});

describe("GET /api/v1/admin/registrations/export", () => {
  it("returns 403 for a non-admin", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTEE" });
    const res = await GET(new NextRequest("http://localhost/api/v1/admin/registrations/export"));
    expect(res.status).toBe(403);
  });

  it("exports CSV with the expected columns and human-readable status", async () => {
    getCurrentUser.mockResolvedValue({ id: "admin1", role: "ADMIN" });
    findMany.mockResolvedValue([row]);
    const res = await GET(new NextRequest("http://localhost/api/v1/admin/registrations/export?format=csv"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    const text = await res.text();
    expect(text).toContain("Registration ID");
    expect(text).toContain("XI-2026-0001");
    expect(text).toContain("Payment Marked Done");
  });

  it("exports a real XLSX workbook", async () => {
    getCurrentUser.mockResolvedValue({ id: "admin1", role: "ADMIN" });
    findMany.mockResolvedValue([row]);
    const res = await GET(new NextRequest("http://localhost/api/v1/admin/registrations/export?format=xlsx"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("spreadsheetml");
    const buffer = Buffer.from(await res.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetRows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]) as Record<string, unknown>[];
    expect(sheetRows[0]["Registration ID"]).toBe("XI-2026-0001");
  });

  it("applies status and package filters to the query", async () => {
    getCurrentUser.mockResolvedValue({ id: "admin1", role: "ADMIN" });
    findMany.mockResolvedValue([]);
    await GET(new NextRequest("http://localhost/api/v1/admin/registrations/export?status=PAYMENT_DONE&workshopPackage=DAY1"));
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "PAYMENT_DONE", workshopPackage: "DAY1" } })
    );
  });
});
