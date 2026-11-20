// A WhatsApp group invite is always either a chat.whatsapp.com/<code>
// link or a wa.me/<number-or-code> link. Validated here so an admin
// can't accidentally save a typo'd or unrelated URL as the group the
// whole cohort is pointed at.
const WHATSAPP_INVITE_URL_PATTERN =
  /^https:\/\/(chat\.whatsapp\.com\/[A-Za-z0-9]+|wa\.me\/[A-Za-z0-9+]+)(\?.*)?$/;

export function isValidWhatsAppInviteUrl(url: string): boolean {
  return WHATSAPP_INVITE_URL_PATTERN.test(url.trim());
}
