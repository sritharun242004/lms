import { NextRequest } from "next/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

const { createRegistration, findRegistrationByCode } = vi.hoisted(() => ({
  createRegistration: vi.fn(),
  findRegistrationByCode: vi.fn(),
}));

vi.mock("@/lib/workshop/registration", () => ({
  createRegistration,
  findRegistrationByCode,
  RegistrationError: class RegistrationError extends Error {
    constructor(message: string, public code: string, public status: number) {
      super(message);
    }
  },
}));

import { POST } from "./route";
import { GET } from "./[code]/route";

function jsonRequest(body: unknown) {
  return new NextRequest("http://localhost/api/v1/workshop/registrations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  createRegistration.mockReset();
  findRegistrationByCode.mockReset();
});

describe("POST /api/v1/workshop/registrations", () => {
  it("returns 201 with the created registration on success", async () => {
    createRegistration.mockResolvedValue({ id: "r1", registrationCode: "XI-2026-0001" });
    const res = await POST(jsonRequest({ fullName: "A" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.registration.registrationCode).toBe("XI-2026-0001");
  });

  it("returns the service's status code and message on failure", async () => {
    const { RegistrationError } = await import("@/lib/workshop/registration");
    createRegistration.mockRejectedValue(new RegistrationError("Bad input", "VALIDATION_ERROR", 400));
    const res = await POST(jsonRequest({}));
    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/workshop/registrations/[code]", () => {
  it("returns 404 when the code does not exist", async () => {
    findRegistrationByCode.mockResolvedValue(null);
    const res = await GET(new NextRequest("http://localhost"), {
      params: Promise.resolve({ code: "XI-2026-9999" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns the registration when found", async () => {
    findRegistrationByCode.mockResolvedValue({ id: "r1", registrationCode: "XI-2026-0001" });
    const res = await GET(new NextRequest("http://localhost"), {
      params: Promise.resolve({ code: "XI-2026-0001" }),
    });
    expect(res.status).toBe(200);
  });

  it("never leaks PII to this unauthenticated endpoint, only the fields the status page renders", async () => {
    findRegistrationByCode.mockResolvedValue({
      id: "r1",
      registrationCode: "XI-2026-0001",
      status: "PAYMENT_DONE",
      workshopPackage: "DAY1",
      amountInInr: 28250,
      fullName: "Asha Rao",
      email: "asha@example.com",
      whatsappNumber: "+919876543210",
      companyName: "Acme Robotics",
      companyAddress: "12 MG Road",
      companyGstin: "33AAAAA0000A1Z5",
      aiUseCase: "internal reporting",
    });
    const res = await GET(new NextRequest("http://localhost"), {
      params: Promise.resolve({ code: "XI-2026-0001" }),
    });
    const body = await res.json();
    expect(body.data.registration).toEqual({
      registrationCode: "XI-2026-0001",
      status: "PAYMENT_DONE",
      workshopPackage: "DAY1",
      amountInInr: 28250,
    });
  });
});
