/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  isAiConfigured: vi.fn(),
  jobFindMany: vi.fn(),
  packFindMany: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/ai/config", () => ({ isAiConfigured: mocks.isAiConfigured }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { skillJob: { findMany: mocks.jobFindMany }, skillPack: { findMany: mocks.packFindMany } } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), redirect: mocks.redirect }));
afterEach(cleanup);

import SkillsBuilderPage from "./page";

const JOB = { id: "j1", title: "Monthly board update", updatedAt: new Date("2026-11-25T10:00:00Z"), _count: { skills: 2, files: 1 } };
const PACK = { id: "p1", title: "Board pack", updatedAt: new Date("2026-11-24T10:00:00Z") };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isAiConfigured.mockReturnValue(true);
  mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTEE" });
  mocks.jobFindMany.mockResolvedValue([JOB]);
  mocks.packFindMany.mockResolvedValue([PACK]);
});

describe("Skills Builder home", () => {
  it("shows the new job form and the user's jobs, newest first", async () => {
    render(await SkillsBuilderPage());
    expect(mocks.jobFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "u1" },
        orderBy: { updatedAt: "desc" },
        take: 20,
        select: expect.objectContaining({ _count: { select: { skills: true, files: { where: { deletedAt: null } } } } }),
      }),
    );
    expect(screen.getByRole("heading", { level: 1, name: "Skills Builder" })).toBeTruthy();
    expect(screen.getByText(/built from your own files and templates/)).toBeTruthy();
    expect(screen.getByLabelText("Describe the job as you do it today")).toBeTruthy();
    const link = screen.getByRole("link", { name: /Monthly board update/ });
    expect(link.getAttribute("href")).toBe("/prompt-bot/skills/j1");
    expect(within(link).getByText("2 skills · 1 file")).toBeTruthy();
    expect(screen.getByText(/sent to Anthropic's API to build your skills/)).toBeTruthy();
  });

  it("lists earlier packs collapsed, read-only, linking to the legacy page", async () => {
    render(await SkillsBuilderPage());
    const details = screen.getByText("Earlier skill packs").closest("details")!;
    expect(details.open).toBe(false);
    expect(within(details).getByText("Read-only")).toBeTruthy();
    expect(within(details).getByRole("link", { name: /Board pack/ }).getAttribute("href")).toBe("/prompt-bot/skills/legacy/p1");
  });

  it("hides the legacy section when there are no earlier packs", async () => {
    mocks.packFindMany.mockResolvedValue([]);
    render(await SkillsBuilderPage());
    expect(screen.queryByText("Earlier skill packs")).toBeNull();
  });

  it("replaces the form with the not-configured panel but keeps the lists", async () => {
    mocks.isAiConfigured.mockReturnValue(false);
    mocks.getCurrentUser.mockResolvedValue({ id: "a1", role: "ADMIN" });
    render(await SkillsBuilderPage());
    expect(screen.getByText("Prompt Bot isn't configured yet")).toBeTruthy();
    expect(screen.getByText(/ANTHROPIC_API_KEY/)).toBeTruthy();
    expect(screen.queryByLabelText("Describe the job as you do it today")).toBeNull();
    expect(screen.getByRole("link", { name: /Monthly board update/ })).toBeTruthy();
  });

  it("never links to the removed catalog", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "c1", role: "MENTOR" });
    render(await SkillsBuilderPage());
    expect(screen.queryByRole("link", { name: /catalog/i })).toBeNull();
  });
});
