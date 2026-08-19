import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  normalizePhotoUpload: vi.fn(),
  transaction: vi.fn(),
  findPhoto: vi.fn(),
  upsertPhoto: vi.fn(),
  deletePhoto: vi.fn(),
  updateUser: vi.fn(),
  createAudit: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/photos/image", () => ({ normalizePhotoUpload: mocks.normalizePhotoUpload, PhotoUploadError: class PhotoUploadError extends Error {} }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    userProfilePhoto: { findUnique: mocks.findPhoto },
  },
}));

import { DELETE, PUT } from "./route";

const coach = {
  id: "coach-1",
  name: "Coach One",
  email: "coach@example.com",
  role: "MENTOR" as const,
  avatarUrl: null,
  emailVerified: true,
};

function uploadRequest(photo = new File(["bytes"], "photo.png", { type: "image/png" })) {
  const form = new FormData();
  form.set("photo", photo);
  return new NextRequest("http://localhost/api/v1/profile/photo", { method: "PUT", body: form });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue(coach);
  mocks.normalizePhotoUpload.mockResolvedValue({
    data: Buffer.from("normalized"), mimeType: "image/webp", size: 10, width: 512, height: 512,
  });
  mocks.findPhoto.mockResolvedValue(null);
  mocks.upsertPhoto.mockResolvedValue({});
  mocks.deletePhoto.mockResolvedValue({});
  mocks.updateUser.mockImplementation(async ({ data }: { data: { avatarUrl: string | null } }) => ({ ...coach, ...data }));
  mocks.createAudit.mockResolvedValue({});
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
    userProfilePhoto: { findUnique: mocks.findPhoto, upsert: mocks.upsertPhoto, delete: mocks.deletePhoto },
    user: { update: mocks.updateUser },
    auditLog: { create: mocks.createAudit },
  }));
});

describe("personal profile photo mutation routes", () => {
  it("rejects anonymous callers and Participants", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);
    expect((await PUT(uploadRequest())).status).toBe(401);

    mocks.getCurrentUser.mockResolvedValueOnce({ ...coach, role: "MENTEE" });
    expect((await PUT(uploadRequest())).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("normalizes before an atomic upsert and returns a versioned AuthUser", async () => {
    const response = await PUT(uploadRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.user).toEqual(expect.objectContaining({
      id: "coach-1", avatarUrl: expect.stringMatching(/^\/api\/v1\/users\/coach-1\/photo\?v=\d+$/),
    }));
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.upsertPhoto).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "coach-1" },
      create: expect.objectContaining({ userId: "coach-1", mimeType: "image/webp", size: 10, width: 512, height: 512, data: Buffer.from("normalized") }),
      update: expect.objectContaining({ mimeType: "image/webp", size: 10, width: 512, height: 512, data: Buffer.from("normalized") }),
    }));
    const audit = mocks.createAudit.mock.calls[0][0].data;
    expect(audit.action).toBe("AVATAR_UPDATED");
    expect(audit.metadata).toEqual({ operation: "add", mimeType: "image/webp", size: 10, width: 512, height: 512 });
    expect(JSON.stringify(audit.metadata)).not.toContain("photo.png");
  });

  it("updates replacement metadata without leaking bytes", async () => {
    mocks.findPhoto.mockResolvedValue({ id: "photo-1" });
    await PUT(uploadRequest());
    expect(mocks.createAudit).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ metadata: { operation: "replace", mimeType: "image/webp", size: 10, width: 512, height: 512 } }),
    }));
  });

  it("does not start a transaction when normalization fails", async () => {
    mocks.normalizePhotoUpload.mockRejectedValue(new Error("bad photo"));
    const response = await PUT(uploadRequest());
    expect(response.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("removes a photo atomically and is idempotent when it is already missing", async () => {
    mocks.findPhoto.mockResolvedValue({ id: "photo-1" });
    const response = await DELETE(new NextRequest("http://localhost/api/v1/profile/photo", { method: "DELETE" }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.user).toEqual({ ...coach, avatarUrl: null });
    expect(mocks.deletePhoto).toHaveBeenCalledWith({ where: { userId: "coach-1" } });
    expect(mocks.updateUser).toHaveBeenCalledWith({ where: { id: "coach-1" }, data: { avatarUrl: null } });
    expect(mocks.createAudit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "AVATAR_REMOVED" }) }));

    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue(coach);
    mocks.findPhoto.mockResolvedValue(null);
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      userProfilePhoto: { findUnique: mocks.findPhoto, delete: mocks.deletePhoto },
      user: { update: mocks.updateUser }, auditLog: { create: mocks.createAudit },
    }));
    const missing = await DELETE(new NextRequest("http://localhost/api/v1/profile/photo", { method: "DELETE" }));
    expect(missing.status).toBe(200);
  });
});
