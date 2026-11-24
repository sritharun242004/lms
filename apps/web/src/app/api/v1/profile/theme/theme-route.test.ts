import { NextRequest } from "next/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

const { getCurrentUser, updateThemePreference } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  updateThemePreference: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/theme/preference", () => ({
  updateThemePreference,
  ThemePreferenceError: class ThemePreferenceError extends Error {
    constructor(message: string, public code: string, public status: number) {
      super(message);
    }
  },
}));

import { PATCH } from "./route";

beforeEach(() => {
  getCurrentUser.mockReset();
  updateThemePreference.mockReset();
});

describe("PATCH /api/v1/profile/theme", () => {
  it("requires authentication", async () => {
    getCurrentUser.mockResolvedValue(null);
    const res = await PATCH(new NextRequest("http://localhost", { method: "PATCH", body: "{}" }));
    expect(res.status).toBe(401);
  });

  it("persists the chosen palette", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTEE" });
    updateThemePreference.mockResolvedValue("violet");
    const req = new NextRequest("http://localhost", { method: "PATCH", body: JSON.stringify({ themePreference: "violet" }) });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    expect(updateThemePreference).toHaveBeenCalledWith("u1", "violet");
  });
});
