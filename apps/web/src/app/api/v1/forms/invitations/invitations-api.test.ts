import { NextRequest } from "next/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

const { getCurrentUser, getInvitationForFilling } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getInvitationForFilling: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/forms/invitations", () => ({ getInvitationForFilling }));
vi.mock("@/lib/forms/form-service", () => ({
  FormError: class FormError extends Error {
    constructor(message: string, public code: string, public status: number) {
      super(message);
    }
  },
}));

import { GET } from "./[id]/route";

beforeEach(() => {
  getCurrentUser.mockReset();
  getInvitationForFilling.mockReset();
});

describe("GET /api/v1/forms/invitations/[id]", () => {
  it("requires authentication", async () => {
    getCurrentUser.mockResolvedValue(null);
    const res = await GET(new NextRequest("http://localhost"), { params: Promise.resolve({ id: "inv1" }) });
    expect(res.status).toBe(401);
  });

  it("returns the invitation with its form", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTEE" });
    getInvitationForFilling.mockResolvedValue({ id: "inv1", form: { sections: [] } });
    const res = await GET(new NextRequest("http://localhost"), { params: Promise.resolve({ id: "inv1" }) });
    expect(res.status).toBe(200);
  });
});
