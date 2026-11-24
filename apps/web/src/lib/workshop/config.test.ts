import { afterEach, describe, expect, it } from "vitest";
import { getGeneralWorkshopWhatsAppInviteUrl } from "./config";

describe("getGeneralWorkshopWhatsAppInviteUrl", () => {
  afterEach(() => {
    delete process.env.WORKSHOP_WHATSAPP_GENERAL_INVITE_URL;
  });

  it("returns null when unset rather than inventing a link", () => {
    expect(getGeneralWorkshopWhatsAppInviteUrl()).toBeNull();
  });

  it("returns the configured link when set", () => {
    process.env.WORKSHOP_WHATSAPP_GENERAL_INVITE_URL = "https://chat.whatsapp.com/GENERAL1";
    expect(getGeneralWorkshopWhatsAppInviteUrl()).toBe("https://chat.whatsapp.com/GENERAL1");
  });
});
