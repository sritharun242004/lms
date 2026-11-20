// The general workshop WhatsApp group a participant is pointed to right
// after registering — distinct from the Day1/Day2-specific group link an
// admin pastes in during payment approval (see lib/workshop/verification.ts).
// Never invented: unset until the business owner supplies a real invite
// link via this env var.
export function getGeneralWorkshopWhatsAppInviteUrl(): string | null {
  const url = process.env.WORKSHOP_WHATSAPP_GENERAL_INVITE_URL;
  return url && url.trim() ? url.trim() : null;
}
