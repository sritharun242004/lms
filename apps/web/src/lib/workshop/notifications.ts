import type { WorkshopRegistration } from "@prisma/client";

export interface NotificationService {
  sendApproval(registration: WorkshopRegistration): Promise<void>;
  sendRejection(registration: WorkshopRegistration, note: string): Promise<void>;
}

// No email/WhatsApp provider is configured yet. This logs instead of
// sending so the approval workflow is fully wired and testable; swapping
// in a real provider later means implementing this interface once, not
// touching verification.ts.
export const consoleNotificationService: NotificationService = {
  async sendApproval(registration) {
    console.log(
      `[notification:approval] ${registration.email} — registration ${registration.id} approved. ` +
        "No email/WhatsApp provider configured; this is a log-only stub."
    );
  },
  async sendRejection(registration, note) {
    console.log(
      `[notification:rejection] ${registration.email} — registration ${registration.id} rejected: ${note}`
    );
  },
};
