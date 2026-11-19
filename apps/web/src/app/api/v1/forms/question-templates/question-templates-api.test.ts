import { NextRequest } from "next/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

const { getCurrentUser, createQuestionTemplate, listQuestionTemplates, insertTemplateIntoSection } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  createQuestionTemplate: vi.fn(),
  listQuestionTemplates: vi.fn(),
  insertTemplateIntoSection: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/forms/question-templates", () => ({
  createQuestionTemplate,
  listQuestionTemplates,
  insertTemplateIntoSection,
}));
vi.mock("@/lib/forms/form-service", () => ({
  FormError: class FormError extends Error {
    constructor(message: string, public code: string, public status: number) {
      super(message);
    }
  },
}));

import { GET, POST } from "./route";
import { POST as insertRoute } from "./[id]/insert/route";

beforeEach(() => {
  getCurrentUser.mockReset();
  createQuestionTemplate.mockReset();
  listQuestionTemplates.mockReset();
  insertTemplateIntoSection.mockReset();
});

describe("question templates API", () => {
  it("requires authentication to list", async () => {
    getCurrentUser.mockResolvedValue(null);
    const res = await GET(new NextRequest("http://localhost/api/v1/forms/question-templates"));
    expect(res.status).toBe(401);
  });

  it("creates a template", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTOR" });
    createQuestionTemplate.mockResolvedValue({ id: "t1" });
    const req = new NextRequest("http://localhost/api/v1/forms/question-templates", {
      method: "POST",
      body: JSON.stringify({ title: "Name", type: "SHORT_ANSWER" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
  });

  it("inserts a template into a section", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTOR" });
    insertTemplateIntoSection.mockResolvedValue({ id: "q1" });
    const req = new NextRequest("http://localhost", { method: "POST", body: JSON.stringify({ sectionId: "s1" }) });
    const res = await insertRoute(req, { params: Promise.resolve({ id: "t1" }) });
    expect(res.status).toBe(201);
    expect(insertTemplateIntoSection).toHaveBeenCalledWith({ id: "u1", role: "MENTOR" }, "t1", "s1");
  });
});
