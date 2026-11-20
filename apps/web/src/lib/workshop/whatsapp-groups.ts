import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { isValidWhatsAppInviteUrl } from "./whatsapp";
import type { WhatsAppGroup } from "@prisma/client";

export class WhatsAppGroupError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) {
    super(message);
    this.name = "WhatsAppGroupError";
  }
}

const inviteUrlSchema = z
  .string()
  .trim()
  .min(1, "Invite link is required")
  .refine(isValidWhatsAppInviteUrl, "That doesn't look like a WhatsApp invite link (expected a wa.me or chat.whatsapp.com URL)");

export const whatsAppGroupInputSchema = z.object({
  name: z.string().trim().min(1, "Group name is required").max(120),
  inviteUrl: inviteUrlSchema,
});

export type WhatsAppGroupInput = z.infer<typeof whatsAppGroupInputSchema>;

export const whatsAppGroupUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  inviteUrl: inviteUrlSchema.optional(),
  isActive: z.boolean().optional(),
});

export type WhatsAppGroupUpdate = z.infer<typeof whatsAppGroupUpdateSchema>;

function parseOrThrow<T>(schema: z.ZodSchema<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new WhatsAppGroupError(parsed.error.issues[0]?.message ?? "Invalid input", "VALIDATION_ERROR", 400);
  }
  return parsed.data;
}

export async function listWhatsAppGroups(): Promise<WhatsAppGroup[]> {
  return prisma.whatsAppGroup.findMany({ orderBy: { createdAt: "desc" } });
}

export async function listActiveWhatsAppGroups(): Promise<WhatsAppGroup[]> {
  return prisma.whatsAppGroup.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
}

export async function createWhatsAppGroup(input: unknown): Promise<WhatsAppGroup> {
  const data = parseOrThrow(whatsAppGroupInputSchema, input);
  return prisma.whatsAppGroup.create({ data });
}

export async function updateWhatsAppGroup(id: string, input: unknown): Promise<WhatsAppGroup> {
  const data = parseOrThrow(whatsAppGroupUpdateSchema, input);
  const existing = await prisma.whatsAppGroup.findUnique({ where: { id } });
  if (!existing) {
    throw new WhatsAppGroupError("WhatsApp group not found", "NOT_FOUND", 404);
  }
  return prisma.whatsAppGroup.update({ where: { id }, data });
}

// Deleting a group never touches past registrations — they keep their
// own snapshot of the group's name/invite link from approval time
// (whatsappGroupName/whatsappGroupInviteUrl), and the FK is
// onDelete: SetNull, so this is always safe to allow.
export async function deleteWhatsAppGroup(id: string): Promise<void> {
  const existing = await prisma.whatsAppGroup.findUnique({ where: { id } });
  if (!existing) {
    throw new WhatsAppGroupError("WhatsApp group not found", "NOT_FOUND", 404);
  }
  await prisma.whatsAppGroup.delete({ where: { id } });
}
