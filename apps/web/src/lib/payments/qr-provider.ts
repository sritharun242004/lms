import QRCode from "qrcode";

// The team's real payment QR (ICICI, M/S Vivam Ventures LLP, UPI ID
// 9940033309.eazypay@icici): one static UPI code, payers type the amount
// themselves. The file is an unscaled crop of the bank's QR card; never
// re-encode or resize it. Set to null to fall back to the badged demo QR.
export const STATIC_PAYMENT_QR_SRC: string | null = "/workshop/payment-qr.png";

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
