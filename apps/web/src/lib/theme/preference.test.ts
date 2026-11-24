import { describe, expect, it, vi, beforeEach } from "vitest";

const { update } = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { user: { update } } }));

import { updateThemePreference } from "./preference";

beforeEach(() => {
  update.mockReset();
});

describe("updateThemePreference", () => {
  it("rejects an unknown palette key", async () => {
    await expect(updateThemePreference("u1", "neon")).rejects.toThrow(/unknown palette/i);
    expect(update).not.toHaveBeenCalled();
  });

  it("persists a valid palette and returns it", async () => {
    update.mockResolvedValue({});
    const result = await updateThemePreference("u1", "emerald");
    expect(result).toBe("emerald");
    expect(update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { themePreference: "emerald" } });
  });
});
