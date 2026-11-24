import { NextRequest } from "next/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

const { getCurrentUser, submitFormResponse, getFormForFilling } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  submitFormResponse: vi.fn(),
  getFormForFilling: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/forms/responses", () => ({ submitFormResponse, getFormForFilling }));
vi.mock("@/lib/forms/form-service", () => ({
  FormError: class FormError extends Error {
    constructor(message: string, public code: string, public status: number) {
      super(message);
    }
  },
}));

import { POST as submitRoute } from "./[id]/responses/route";
import { GET as fillRoute } from "./[id]/fill/route";

beforeEach(() => {
  getCurrentUser.mockReset();
  submitFormResponse.mockReset();
  getFormForFilling.mockReset();
});

describe("POST /api/v1/forms/[id]/responses", () => {
  it("requires authentication", async () => {
    getCurrentUser.mockResolvedValue(null);
    const res = await submitRoute(new NextRequest("http://localhost", { method: "POST", body: "{}" }), {
      params: Promise.resolve({ id: "f1" }),
    });
    expect(res.status).toBe(401);
  });

  it("submits a response", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTEE" });
    submitFormResponse.mockResolvedValue({ id: "r1" });
    const req = new NextRequest("http://localhost", {
      method: "POST",
      body: JSON.stringify({ answers: [{ questionId: "q1", value: "hi" }] }),
    });
    const res = await submitRoute(req, { params: Promise.resolve({ id: "f1" }) });
    expect(res.status).toBe(201);
  });
});

describe("GET /api/v1/forms/[id]/fill", () => {
  it("returns the form when open", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTEE" });
    getFormForFilling.mockResolvedValue({ id: "f1", sections: [] });
    const res = await fillRoute(new NextRequest("http://localhost"), { params: Promise.resolve({ id: "f1" }) });
    expect(res.status).toBe(200);
  });
});
