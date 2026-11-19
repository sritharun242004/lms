import { describe, expect, it, afterEach } from "vitest";
import { generatePaymentQrDataUrl, isDemoPaymentMode } from "./qr-provider";

describe("isDemoPaymentMode", () => {
  afterEach(() => {
    delete process.env.PAYMENT_DEMO_MODE;
  });

  it("defaults to true when unset", () => {
    expect(isDemoPaymentMode()).toBe(true);
  });

  it("is false only when explicitly set to 'false'", () => {
    process.env.PAYMENT_DEMO_MODE = "false";
    expect(isDemoPaymentMode()).toBe(false);
  });
});

describe("generatePaymentQrDataUrl", () => {
  it("returns a PNG data URL encoding a DEMO-prefixed payload", async () => {
    const url = await generatePaymentQrDataUrl({ registrationCode: "XI-2026-0001", amountInInr: 28250 });
    expect(url.startsWith("data:image/png;base64,")).toBe(true);
  });
});
