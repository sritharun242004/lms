import QRCode from "qrcode";

export function isDemoPaymentMode(): boolean {
  return process.env.PAYMENT_DEMO_MODE !== "false";
}

// Swap point: a real integration replaces this function's body with a
// provider-specific payload (e.g. a UPI deep link or gateway order QR)
// while every caller — the payment page, tests — stays unchanged.
export async function generatePaymentQrDataUrl(input: {
  registrationCode: string;
  amountInInr: number;
}): Promise<string> {
  const payload = `DEMO:${input.registrationCode}:${input.amountInInr}`;
  return QRCode.toDataURL(payload, { margin: 1, width: 280 });
}
