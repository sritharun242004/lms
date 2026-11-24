import { getGeneralWorkshopWhatsAppInviteUrl } from "@/lib/workshop/config";
import { successResponse } from "@/lib/api/response";

export async function GET() {
  return successResponse({ generalWhatsAppInviteUrl: getGeneralWorkshopWhatsAppInviteUrl() });
}
