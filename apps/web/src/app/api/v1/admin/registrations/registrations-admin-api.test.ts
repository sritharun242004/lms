import { NextRequest } from "next/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

const { getCurrentUser, findMany, groupBy } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  findMany: vi.fn(),
  groupBy: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser }));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    workshopRegistration: { findMany, groupBy },
  },
}));

import { GET } from "./route";

beforeEach(() => {
  getCurrentUser.mockReset();
  findMany.mockReset();
  groupBy.mockReset();
});

describe("GET /api/v1/admin/registrations", () => {
  it("returns 403 for a MENTEE", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTEE" });
    const res = await GET(new NextRequest("http://localhost/api/v1/admin/registrations"));
    expect(res.status).toBe(403);
  });

  it("returns 200 with registrations for ADMIN", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", role: "ADMIN" });
    findMany.mockResolvedValue([{ id: "r1" }]);
    groupBy.mockResolvedValue([{ status: "PAYMENT_DONE", _count: 1, _sum: { amountInInr: 28250 } }]);
    const res = await GET(new NextRequest("http://localhost/api/v1/admin/registrations"));
    expect(res.status).toBe(200);
  });

  it("returns 403 for a MENTOR (staff is not admin)", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTOR" });
    const res = await GET(new NextRequest("http://localhost/api/v1/admin/registrations"));
    expect(res.status).toBe(403);
  });
});
