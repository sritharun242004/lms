import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import { STATIC_PAYMENT_QR_SRC, generatePaymentQrDataUrl, isDemoPaymentMode } from "./qr-provider";

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

describe("STATIC_PAYMENT_QR_SRC", () => {
  // Pins the exact bytes of the bank's QR. Any re-save, compression or
  // swap of the image changes this hash and fails here first, instead of
  // silently sending payments somewhere else (or nowhere).
  it("points at the untouched ICICI payment QR in public/", () => {
    expect(STATIC_PAYMENT_QR_SRC).toBe("/workshop/payment-qr.png");
    const file = readFileSync(join(process.cwd(), "public", STATIC_PAYMENT_QR_SRC!));
    expect(createHash("sha256").update(file).digest("hex")).toBe("cdd63aa28a613d76902c1afb0fe32d936fb507118c763dc06ec709e90eed3c89");
  });
});
