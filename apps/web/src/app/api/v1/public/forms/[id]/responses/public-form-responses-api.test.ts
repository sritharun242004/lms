import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { submitPublicFormResponse } = vi.hoisted(() => ({ submitPublicFormResponse: vi.fn() }));
vi.mock("@/lib/forms/responses", () => ({ submitPublicFormResponse }));

import { POST } from "./route";
import { resetRateLimitsForTests } from "@/lib/api/rate-limit";
import { FormError } from "@/lib/forms/form-service";

const context = { params: Promise.resolve({ id: "f1" }) };
const post = (body: unknown, ip = "1.2.3.4") =>
  POST(
    new NextRequest("http://localhost/api/v1/public/forms/f1/responses", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    }),
    context
  );

beforeEach(() => {
  submitPublicFormResponse.mockReset();
  resetRateLimitsForTests();
});

describe("POST /api/v1/public/forms/[id]/responses", () => {
  it("saves the answers", async () => {
    submitPublicFormResponse.mockResolvedValue({ id: "r1" });
    const res = await post({ answers: [{ questionId: "q1", value: "Asha" }] });
    expect(res.status).toBe(201);
    expect(submitPublicFormResponse).toHaveBeenCalledWith("f1", [{ questionId: "q1", value: "Asha" }]);
  });

  it("pretends to succeed for a bot that filled the hidden field, saving nothing", async () => {
    const res = await post({ website: "http://spam.example", answers: [{ questionId: "q1", value: "x" }] });
    expect(res.status).toBe(201);
    expect(submitPublicFormResponse).not.toHaveBeenCalled();
  });

  it("rejects malformed answers and bodies", async () => {
    expect((await post({ answers: [{ value: "no id" }] })).status).toBe(400);
    expect((await post("not json")).status).toBe(400);
    expect(submitPublicFormResponse).not.toHaveBeenCalled();
  });

  it("passes on the form's own errors", async () => {
    submitPublicFormResponse.mockRejectedValue(new FormError("This form isn't available", "NOT_FOUND", 404));
    expect((await post({ answers: [] })).status).toBe(404);
  });

  it("slows down a flood from one address", async () => {
    submitPublicFormResponse.mockResolvedValue({ id: "r" });
    let last = 0;
    for (let i = 0; i < 121; i += 1) last = (await post({ answers: [] }, "9.9.9.9")).status;
    expect(last).toBe(429);
    expect((await post({ answers: [] }, "8.8.8.8")).status).toBe(201);
  });
});
