import { describe, expect, it } from "vitest";
import { isValidWhatsAppInviteUrl } from "./whatsapp";

describe("isValidWhatsAppInviteUrl", () => {
  it("accepts a chat.whatsapp.com invite link", () => {
    expect(isValidWhatsAppInviteUrl("https://chat.whatsapp.com/ABC123xyz")).toBe(true);
  });

  it("accepts a wa.me link", () => {
    expect(isValidWhatsAppInviteUrl("https://wa.me/919876543210")).toBe(true);
  });

  it("accepts a link with a query string", () => {
    expect(isValidWhatsAppInviteUrl("https://wa.me/919876543210?text=hi")).toBe(true);
  });

  it("rejects a non-WhatsApp URL", () => {
    expect(isValidWhatsAppInviteUrl("https://example.com/group")).toBe(false);
  });

  it("rejects an insecure http link", () => {
    expect(isValidWhatsAppInviteUrl("http://chat.whatsapp.com/ABC123")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidWhatsAppInviteUrl("")).toBe(false);
  });
});
