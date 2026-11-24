import { NextRequest } from "next/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

const { getCurrentUser, getOpenTextAnswersForResponses } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getOpenTextAnswersForResponses: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/forms/feedback-word-cloud", () => ({ getOpenTextAnswersForResponses }));
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
  getOpenTextAnswersForResponses.mockReset();
});

describe("GET /api/v1/feedback/word-cloud/responses", () => {
  it("parses the comma-separated ids param", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTOR" });
    getOpenTextAnswersForResponses.mockResolvedValue([]);
    await GET(new NextRequest("http://localhost/api/v1/feedback/word-cloud/responses?ids=r1,r2"));
    expect(getOpenTextAnswersForResponses).toHaveBeenCalledWith({ id: "u1", role: "MENTOR" }, ["r1", "r2"]);
  });
});
