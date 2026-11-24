import { NextRequest } from "next/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

const { getCurrentUser, createForm, listForms, getFormWithStructure, updateFormMeta, saveFormStructure, setFormStatus, duplicateForm } =
  vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    createForm: vi.fn(),
    listForms: vi.fn(),
    getFormWithStructure: vi.fn(),
    updateFormMeta: vi.fn(),
    saveFormStructure: vi.fn(),
    setFormStatus: vi.fn(),
    duplicateForm: vi.fn(),
  }));

vi.mock("@/lib/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/forms/form-service", () => ({
  createForm,
  listForms,
  getFormWithStructure,
  updateFormMeta,
  saveFormStructure,
  setFormStatus,
  duplicateForm,
  FormError: class FormError extends Error {
    constructor(message: string, public code: string, public status: number) {
      super(message);
    }
  },
}));

import { GET as listRoute, POST as createRoute } from "./route";
import { GET as getRoute, PATCH as patchRoute } from "./[id]/route";
import { PUT as structureRoute } from "./[id]/structure/route";
import { POST as statusRoute } from "./[id]/status/route";
import { POST as duplicateRoute } from "./[id]/duplicate/route";

beforeEach(() => {
  getCurrentUser.mockReset();
  createForm.mockReset();
  listForms.mockReset();
  getFormWithStructure.mockReset();
  updateFormMeta.mockReset();
  saveFormStructure.mockReset();
  setFormStatus.mockReset();
  duplicateForm.mockReset();
});

describe("GET/POST /api/v1/forms", () => {
  it("requires authentication", async () => {
    getCurrentUser.mockResolvedValue(null);
    const res = await listRoute(new NextRequest("http://localhost/api/v1/forms"));
    expect(res.status).toBe(401);
  });

  it("creates a form", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTOR" });
    createForm.mockResolvedValue({ id: "f1", title: "Session feedback" });
    const req = new NextRequest("http://localhost/api/v1/forms", {
      method: "POST",
      body: JSON.stringify({ title: "Session feedback" }),
    });
    const res = await createRoute(req);
    expect(res.status).toBe(201);
  });
});

describe("GET/PATCH /api/v1/forms/[id]", () => {
  it("returns the form with its structure", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTOR" });
    getFormWithStructure.mockResolvedValue({ id: "f1", sections: [] });
    const res = await getRoute(new NextRequest("http://localhost"), { params: Promise.resolve({ id: "f1" }) });
    expect(res.status).toBe(200);
  });

  it("updates form metadata", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTOR" });
    updateFormMeta.mockResolvedValue({ id: "f1", title: "Updated" });
    const req = new NextRequest("http://localhost", { method: "PATCH", body: JSON.stringify({ title: "Updated" }) });
    const res = await patchRoute(req, { params: Promise.resolve({ id: "f1" }) });
    expect(res.status).toBe(200);
  });
});

describe("PUT /api/v1/forms/[id]/structure", () => {
  it("saves the sections tree", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTOR" });
    saveFormStructure.mockResolvedValue(undefined);
    const req = new NextRequest("http://localhost", {
      method: "PUT",
      body: JSON.stringify({ sections: [{ title: "S1", questions: [] }] }),
    });
    const res = await structureRoute(req, { params: Promise.resolve({ id: "f1" }) });
    expect(res.status).toBe(200);
    expect(saveFormStructure).toHaveBeenCalledWith(
      { id: "u1", role: "MENTOR" },
      "f1",
      [{ title: "S1", questions: [] }]
    );
  });
});

describe("POST /api/v1/forms/[id]/status", () => {
  it("rejects an unknown status value", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTOR" });
    const req = new NextRequest("http://localhost", { method: "POST", body: JSON.stringify({ status: "LIVE" }) });
    const res = await statusRoute(req, { params: Promise.resolve({ id: "f1" }) });
    expect(res.status).toBe(400);
  });

  it("publishes a form", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTOR" });
    setFormStatus.mockResolvedValue({ id: "f1", status: "PUBLISHED" });
    const req = new NextRequest("http://localhost", { method: "POST", body: JSON.stringify({ status: "PUBLISHED" }) });
    const res = await statusRoute(req, { params: Promise.resolve({ id: "f1" }) });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/forms/[id]/duplicate", () => {
  it("duplicates a form", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTOR" });
    duplicateForm.mockResolvedValue({ id: "f2", title: "Session feedback (copy)" });
    const res = await duplicateRoute(new NextRequest("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: "f1" }),
    });
    expect(res.status).toBe(201);
  });
});
