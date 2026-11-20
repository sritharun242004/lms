import { NextRequest } from "next/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

const { getCurrentUser, listFeedbackSubmissions } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  listFeedbackSubmissions: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/forms/feedback", () => ({ listFeedbackSubmissions }));
vi.mock("@/lib/forms/form-service", () => ({
  FormError: class FormError extends Error {
    constructor(message: string, public code: string, public status: number) {
      super(message);
    }
  },
}));

import { GET } from "./route";

beforeEach(() => {
  getCurrentUser.mockReset();
  listFeedbackSubmissions.mockReset();
});

describe("GET /api/v1/admin/feedback/submissions", () => {
  it("returns 401 when unauthenticated", async () => {
    getCurrentUser.mockResolvedValue(null);
    const res = await GET(new NextRequest("http://localhost/api/v1/admin/feedback/submissions"));
    expect(res.status).toBe(401);
  });

  it("returns the submission list for staff", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTOR" });
    listFeedbackSubmissions.mockResolvedValue([{ responseId: "r1" }]);
    const res = await GET(new NextRequest("http://localhost/api/v1/admin/feedback/submissions?q=asha"));
    expect(res.status).toBe(200);
    expect(listFeedbackSubmissions).toHaveBeenCalledWith({ id: "u1", role: "MENTOR" }, { formId: undefined, q: "asha" });
  });

  it("surfaces a FormError with its own status code", async () => {
    const { FormError } = await import("@/lib/forms/form-service");
    getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTEE" });
    listFeedbackSubmissions.mockRejectedValue(new FormError("Staff access required", "FORBIDDEN", 403));
    const res = await GET(new NextRequest("http://localhost/api/v1/admin/feedback/submissions"));
    expect(res.status).toBe(403);
  });
});
