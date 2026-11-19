import { NextRequest } from "next/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

const { getCurrentUser, getFormAnalytics, exportFormResponsesCsv } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getFormAnalytics: vi.fn(),
  exportFormResponsesCsv: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/forms/analytics", () => ({ getFormAnalytics, exportFormResponsesCsv }));
vi.mock("@/lib/forms/form-service", () => ({
  FormError: class FormError extends Error {
    constructor(message: string, public code: string, public status: number) {
      super(message);
    }
  },
}));

import { GET as analyticsRoute } from "./route";
import { GET as exportRoute } from "../responses/export/route";

beforeEach(() => {
  getCurrentUser.mockReset();
  getFormAnalytics.mockReset();
  exportFormResponsesCsv.mockReset();
});

describe("GET /api/v1/forms/[id]/analytics", () => {
  it("returns analytics for the form owner", async () => {
    getCurrentUser.mockResolvedValue({ id: "staff1", role: "MENTOR" });
    getFormAnalytics.mockResolvedValue({ formId: "f1", totalResponses: 2 });
    const res = await analyticsRoute(new NextRequest("http://localhost"), { params: Promise.resolve({ id: "f1" }) });
    expect(res.status).toBe(200);
  });
});

describe("GET /api/v1/forms/[id]/responses/export", () => {
  it("returns a CSV attachment", async () => {
    getCurrentUser.mockResolvedValue({ id: "staff1", role: "MENTOR" });
    exportFormResponsesCsv.mockResolvedValue("Response ID\nr1");
    const res = await exportRoute(new NextRequest("http://localhost"), { params: Promise.resolve({ id: "f1" }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain("attachment");
  });
});
