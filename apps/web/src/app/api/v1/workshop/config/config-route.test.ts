import { describe, expect, it, afterEach } from "vitest";
import { GET } from "./route";

describe("GET /api/v1/workshop/config", () => {
  afterEach(() => {
    delete process.env.WORKSHOP_WHATSAPP_GENERAL_INVITE_URL;
  });

  it("returns null when no general invite URL is configured", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.data.generalWhatsAppInviteUrl).toBeNull();
  });

  it("returns the configured general invite URL", async () => {
    process.env.WORKSHOP_WHATSAPP_GENERAL_INVITE_URL = "https://chat.whatsapp.com/GENERAL1";
    const res = await GET();
    const body = await res.json();
    expect(body.data.generalWhatsAppInviteUrl).toBe("https://chat.whatsapp.com/GENERAL1");
  });
});
