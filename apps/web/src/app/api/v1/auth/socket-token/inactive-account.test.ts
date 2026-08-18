import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAccessTokenFromCookies: vi.fn(),
  verifyAccessToken: vi.fn(),
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getAccessTokenFromCookies: mocks.getAccessTokenFromCookies,
  verifyAccessToken: mocks.verifyAccessToken,
  getCurrentUser: mocks.getCurrentUser,
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAccessTokenFromCookies.mockResolvedValue("valid-access-token");
  mocks.verifyAccessToken.mockReturnValue({ sub: "coach-1", role: "MENTOR" });
});

describe("socket token active-account enforcement", () => {
  it("does not relay an otherwise valid access token for an inactive account", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(body.data).toBeUndefined();
  });
});
