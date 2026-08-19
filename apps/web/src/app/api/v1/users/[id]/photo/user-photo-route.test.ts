import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  canViewUserPhoto: vi.fn(),
  findPhoto: vi.fn(),
  photoResponse: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/photos/access", () => ({ canViewUserPhoto: mocks.canViewUserPhoto }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { userProfilePhoto: { findUnique: mocks.findPhoto } } }));
vi.mock("@/lib/photos/response", () => ({ photoResponse: mocks.photoResponse }));

import { GET } from "./route";

const viewer = { id: "mentee-1", name: "Participant", email: null, role: "MENTEE" as const, avatarUrl: null, emailVerified: false };
const photo = { data: Buffer.from("webp"), mimeType: "image/webp", size: 4, updatedAt: new Date("2026-08-19T00:00:00.000Z") };
const context = { params: Promise.resolve({ id: "coach-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue(viewer);
  mocks.canViewUserPhoto.mockResolvedValue(true);
  mocks.findPhoto.mockResolvedValue(photo);
  mocks.photoResponse.mockReturnValue(new Response(photo.data, { status: 200, headers: { "Content-Type": "image/webp" } }));
});

describe("authorized user profile photo GET", () => {
  it("rejects anonymous and unrelated viewers", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);
    expect((await GET(new NextRequest("http://localhost/api/v1/users/coach-1/photo"), context)).status).toBe(401);

    mocks.getCurrentUser.mockResolvedValue(viewer);
    mocks.canViewUserPhoto.mockResolvedValue(false);
    expect((await GET(new NextRequest("http://localhost/api/v1/users/coach-1/photo"), context)).status).toBe(403);
    expect(mocks.findPhoto).not.toHaveBeenCalled();
  });

  it("selects only the binary photo and delegates secure response headers", async () => {
    const request = new NextRequest("http://localhost/api/v1/users/coach-1/photo");
    const response = await GET(request, context);
    expect(response.status).toBe(200);
    expect(mocks.canViewUserPhoto).toHaveBeenCalledWith(viewer, "coach-1");
    expect(mocks.findPhoto).toHaveBeenCalledWith({
      where: { userId: "coach-1" },
      select: { data: true, mimeType: true, size: true, updatedAt: true },
    });
    expect(mocks.photoResponse).toHaveBeenCalledWith(photo, request);
  });

  it("returns 404 when a visible user has no stored photo", async () => {
    mocks.findPhoto.mockResolvedValue(null);
    const response = await GET(new NextRequest("http://localhost/api/v1/users/coach-1/photo"), context);
    const body = await response.json();
    expect(response.status).toBe(404);
    expect(body.error.code).toBe("PHOTO_NOT_FOUND");
    expect(mocks.photoResponse).not.toHaveBeenCalled();
  });
});
