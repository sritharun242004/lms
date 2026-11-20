import { describe, expect, it, vi, beforeEach } from "vitest";

const { findMany, create, update, deleteOne, findUnique } = vi.hoisted(() => ({
  findMany: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  deleteOne: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    whatsAppGroup: { findMany, create, update, delete: deleteOne, findUnique },
  },
}));

import {
  createWhatsAppGroup,
  deleteWhatsAppGroup,
  listActiveWhatsAppGroups,
  listWhatsAppGroups,
  updateWhatsAppGroup,
  WhatsAppGroupError,
} from "./whatsapp-groups";

beforeEach(() => {
  findMany.mockReset();
  create.mockReset();
  update.mockReset();
  deleteOne.mockReset();
  findUnique.mockReset();
});

describe("createWhatsAppGroup", () => {
  it("rejects a missing name", async () => {
    await expect(createWhatsAppGroup({ name: "", inviteUrl: "https://wa.me/919876543210" })).rejects.toThrow(
      WhatsAppGroupError
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects an invalid WhatsApp invite link", async () => {
    await expect(createWhatsAppGroup({ name: "Day 1", inviteUrl: "https://example.com/group" })).rejects.toThrow(
      /whatsapp invite link/i
    );
  });

  it("creates a group with a valid name and link", async () => {
    create.mockResolvedValue({ id: "g1", name: "XI Workshop — Day 1", inviteUrl: "https://chat.whatsapp.com/ABC123", isActive: true });
    const group = await createWhatsAppGroup({ name: "XI Workshop — Day 1", inviteUrl: "https://chat.whatsapp.com/ABC123" });
    expect(group.id).toBe("g1");
    expect(create).toHaveBeenCalledWith({ data: { name: "XI Workshop — Day 1", inviteUrl: "https://chat.whatsapp.com/ABC123" } });
  });
});

describe("listWhatsAppGroups / listActiveWhatsAppGroups", () => {
  it("lists all groups newest first", async () => {
    findMany.mockResolvedValue([{ id: "g1" }]);
    await listWhatsAppGroups();
    expect(findMany).toHaveBeenCalledWith({ orderBy: { createdAt: "desc" } });
  });

  it("lists only active groups, alphabetically", async () => {
    findMany.mockResolvedValue([{ id: "g1" }]);
    await listActiveWhatsAppGroups();
    expect(findMany).toHaveBeenCalledWith({ where: { isActive: true }, orderBy: { name: "asc" } });
  });
});

describe("updateWhatsAppGroup", () => {
  it("rejects updating a group that doesn't exist", async () => {
    findUnique.mockResolvedValue(null);
    await expect(updateWhatsAppGroup("missing", { isActive: false })).rejects.toThrow(/not found/i);
    expect(update).not.toHaveBeenCalled();
  });

  it("can deactivate a group without touching its name or link", async () => {
    findUnique.mockResolvedValue({ id: "g1", name: "Day 1", inviteUrl: "https://wa.me/919876543210", isActive: true });
    update.mockResolvedValue({ id: "g1", isActive: false });
    await updateWhatsAppGroup("g1", { isActive: false });
    expect(update).toHaveBeenCalledWith({ where: { id: "g1" }, data: { isActive: false } });
  });

  it("rejects an invalid replacement link", async () => {
    findUnique.mockResolvedValue({ id: "g1", name: "Day 1", inviteUrl: "https://wa.me/919876543210", isActive: true });
    await expect(updateWhatsAppGroup("g1", { inviteUrl: "not-a-link" })).rejects.toThrow(/whatsapp invite link/i);
  });
});

describe("deleteWhatsAppGroup", () => {
  it("rejects deleting a group that doesn't exist", async () => {
    findUnique.mockResolvedValue(null);
    await expect(deleteWhatsAppGroup("missing")).rejects.toThrow(/not found/i);
    expect(deleteOne).not.toHaveBeenCalled();
  });

  it("deletes an existing group", async () => {
    findUnique.mockResolvedValue({ id: "g1" });
    await deleteWhatsAppGroup("g1");
    expect(deleteOne).toHaveBeenCalledWith({ where: { id: "g1" } });
  });
});
