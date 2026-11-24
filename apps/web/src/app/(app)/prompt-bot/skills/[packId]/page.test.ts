/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), isAiConfigured: vi.fn(), loadPackView: vi.fn(), redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/ai/config", () => ({ isAiConfigured: mocks.isAiConfigured }));
vi.mock("@/lib/skills/packs", () => ({ loadPackView: mocks.loadPackView }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
afterEach(cleanup);

import SkillPackPage from "./page";

const PACK = {
  id: "p1",
  title: "My week",
  description: "Weekly work.",
  role: null,
  matrix: { id: "m", name: "Skill definition", questions: [] },
  items: [],
};

describe("skill pack page", () => {
  it("shows an existing pack even when the AI is not configured (only AI actions are gated)", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTEE" });
    mocks.loadPackView.mockResolvedValue(PACK);
    mocks.isAiConfigured.mockReturnValue(false);
    render(await SkillPackPage({ params: Promise.resolve({ packId: "p1" }) }));
    expect(screen.getByRole("heading", { level: 1, name: "My week" })).toBeTruthy();
    expect(mocks.loadPackView).toHaveBeenCalledWith("p1", "u1");
  });
});
