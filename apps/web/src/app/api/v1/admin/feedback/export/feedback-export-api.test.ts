import { NextRequest } from "next/server";
import { describe, expect, it, vi, beforeEach } from "vitest";
import * as XLSX from "xlsx";

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

const submission = {
  responseId: "r1",
  formId: "f1",
  formTitle: "Day 1 feedback",
  submittedAt: new Date("2026-11-20T10:00:00Z"),
  anonymous: false,
  respondentName: "Asha Rao",
  respondentEmail: "asha@example.com",
  answers: [{ questionId: "q1", questionTitle: "How was the session?", value: "Excellent" }],
};

beforeEach(() => {
  getCurrentUser.mockReset();
  listFeedbackSubmissions.mockReset();
});

describe("GET /api/v1/admin/feedback/export", () => {
  it("returns 401 when unauthenticated", async () => {
    getCurrentUser.mockResolvedValue(null);
    const res = await GET(new NextRequest("http://localhost/api/v1/admin/feedback/export"));
    expect(res.status).toBe(401);
  });

  it("exports CSV with one column per question and the actual submitted answer", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", role: "ADMIN" });
    listFeedbackSubmissions.mockResolvedValue([submission]);
    const res = await GET(new NextRequest("http://localhost/api/v1/admin/feedback/export?format=csv"));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("How was the session?");
    expect(text).toContain("Excellent");
    expect(text).toContain("Asha Rao");
  });

  it("hides participant details for an anonymous submission in the export", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", role: "ADMIN" });
    listFeedbackSubmissions.mockResolvedValue([{ ...submission, anonymous: true }]);
    const res = await GET(new NextRequest("http://localhost/api/v1/admin/feedback/export?format=csv"));
    const text = await res.text();
    expect(text).toContain("Anonymous");
    expect(text).not.toContain("asha@example.com");
  });

  it("exports a real XLSX workbook", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", role: "ADMIN" });
    listFeedbackSubmissions.mockResolvedValue([submission]);
    const res = await GET(new NextRequest("http://localhost/api/v1/admin/feedback/export?format=xlsx"));
    const buffer = Buffer.from(await res.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]) as Record<string, unknown>[];
    expect(rows[0]["How was the session?"]).toBe("Excellent");
  });
});
