import { describe, expect, it, vi, beforeEach } from "vitest";

const { getCurrentUser, findMany, groupBy, approveRegistration, rejectRegistration, requestResubmission } =
  vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    findMany: vi.fn(),
    groupBy: vi.fn(),
    approveRegistration: vi.fn(),
    rejectRegistration: vi.fn(),
    requestResubmission: vi.fn(),
  }));

vi.mock("@/lib/auth", () => ({ getCurrentUser }));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    workshopRegistration: { findMany, groupBy },
  },
}));

vi.mock("@/lib/workshop/verification", () => ({
  approveRegistration,
  rejectRegistration,
  requestResubmission,
  VerificationError: class VerificationError extends Error {
    constructor(message: string, public code: string, public status: number) {
      super(message);
    }
  },
}));

import { GET } from "./route";
import { PATCH } from "./[id]/route";

beforeEach(() => {
  getCurrentUser.mockReset();
  findMany.mockReset();
  groupBy.mockReset();
  approveRegistration.mockReset();
  rejectRegistration.mockReset();
  requestResubmission.mockReset();
});

describe("GET /api/v1/admin/registrations", () => {
  it("returns 403 for a MENTEE", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTEE" });
    const res = await GET(new Request("http://localhost/api/v1/admin/registrations") as any);
    expect(res.status).toBe(403);
  });

  it("returns 200 with registrations for ADMIN", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", role: "ADMIN" });
    findMany.mockResolvedValue([{ id: "r1" }]);
    groupBy.mockResolvedValue([{ status: "APPROVED", _count: 1, _sum: { amountInInr: 28250 } }]);
    const res = await GET(new Request("http://localhost/api/v1/admin/registrations") as any);
    expect(res.status).toBe(200);
  });

  it("returns 200 for SUPER_ADMIN", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", role: "SUPER_ADMIN" });
    findMany.mockResolvedValue([]);
    groupBy.mockResolvedValue([]);
    const res = await GET(new Request("http://localhost/api/v1/admin/registrations") as any);
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/v1/admin/registrations/[id]", () => {
  it("calls approveRegistration for action APPROVE", async () => {
    getCurrentUser.mockResolvedValue({ id: "admin1", role: "ADMIN" });
    approveRegistration.mockResolvedValue({ id: "r1", status: "APPROVED" });
    const req = new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify({ action: "APPROVE", note: "ok" }),
    }) as any;
    const res = await PATCH(req, { params: Promise.resolve({ id: "r1" }) });
    expect(approveRegistration).toHaveBeenCalledWith("admin1", "r1", "ok");
    expect(res.status).toBe(200);
  });

  it("rejects an unknown action with 400", async () => {
    getCurrentUser.mockResolvedValue({ id: "admin1", role: "ADMIN" });
    const req = new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify({ action: "DO_SOMETHING_ELSE" }),
    }) as any;
    const res = await PATCH(req, { params: Promise.resolve({ id: "r1" }) });
    expect(res.status).toBe(400);
  });
});
