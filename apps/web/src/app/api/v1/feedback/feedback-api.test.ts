import { NextRequest } from "next/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

const { getCurrentUser, getFeedbackAggregates, getFeedbackWordCloud } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getFeedbackAggregates: vi.fn(),
  getFeedbackWordCloud: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/forms/feedback", () => ({ getFeedbackAggregates }));
vi.mock("@/lib/forms/feedback-word-cloud", () => ({ getFeedbackWordCloud }));
vi.mock("@/lib/forms/form-service", () => ({
  FormError: class FormError extends Error {
    constructor(message: string, public code: string, public status: number) {
      super(message);
    }
  },
}));

import { GET as aggregatesRoute } from "./route";
import { GET as wordCloudRoute } from "./word-cloud/route";

beforeEach(() => {
  getCurrentUser.mockReset();
  getFeedbackAggregates.mockReset();
  getFeedbackWordCloud.mockReset();
});

describe("GET /api/v1/feedback", () => {
  it("requires authentication", async () => {
    getCurrentUser.mockResolvedValue(null);
    const res = await aggregatesRoute();
    expect(res.status).toBe(401);
  });

  it("returns feedback aggregates", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTOR" });
    getFeedbackAggregates.mockResolvedValue([{ targetType: "TRAINER", targetLabel: "Mehul", responseCount: 2, averagesByQuestion: [] }]);
    const res = await aggregatesRoute();
    expect(res.status).toBe(200);
  });
});

describe("GET /api/v1/feedback/word-cloud", () => {
  it("returns word cloud entries with filters applied", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTOR" });
    getFeedbackWordCloud.mockResolvedValue([{ word: "great", count: 3, responseIds: ["r1"] }]);
    const res = await wordCloudRoute(new NextRequest("http://localhost/api/v1/feedback/word-cloud?formId=f1"));
    expect(res.status).toBe(200);
    expect(getFeedbackWordCloud).toHaveBeenCalledWith({ id: "u1", role: "MENTOR" }, expect.objectContaining({ formId: "f1" }));
  });
});
