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
const page = (search: Record<string, string> = {}) => ({ searchParams: Promise.resolve(search) });
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
    render(await SkillsBuilderPage(page()));
    expect(mocks.jobFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "u1" },
        orderBy: { updatedAt: "desc" },
        take: 21,
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
    render(await SkillsBuilderPage(page()));
    const details = screen.getByText("Earlier skill packs").closest("details")!;
    expect(details.open).toBe(false);
    expect(within(details).getByText("Read-only")).toBeTruthy();
    expect(within(details).getByRole("link", { name: /Board pack/ }).getAttribute("href")).toBe("/prompt-bot/skills/legacy/p1");
  });

  it("hides the legacy section when there are no earlier packs", async () => {
    mocks.packFindMany.mockResolvedValue([]);
    render(await SkillsBuilderPage(page()));
    expect(screen.queryByText("Earlier skill packs")).toBeNull();
  });

  it("replaces the form with the not-configured panel but keeps the lists", async () => {
    mocks.isAiConfigured.mockReturnValue(false);
    mocks.getCurrentUser.mockResolvedValue({ id: "a1", role: "ADMIN" });
    render(await SkillsBuilderPage(page()));
    expect(screen.getByText("Prompt Bot isn't configured yet")).toBeTruthy();
    expect(screen.getByText(/ANTHROPIC_API_KEY/)).toBeTruthy();
    expect(screen.queryByLabelText("Describe the job as you do it today")).toBeNull();
    expect(screen.getByRole("link", { name: /Monthly board update/ })).toBeTruthy();
  });

  it("never links to the removed catalog", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "c1", role: "MENTOR" });
    render(await SkillsBuilderPage(page()));
    expect(screen.queryByRole("link", { name: /catalog/i })).toBeNull();
  });

  it("offers Show all only when there are more than 20 jobs or packs, and lists up to 200 then", async () => {
    render(await SkillsBuilderPage(page()));
    expect(screen.queryByRole("link", { name: /Show all/ })).toBeNull();
    cleanup();

    const jobs = Array.from({ length: 21 }, (_, i) => ({ ...JOB, id: `j${i}`, title: `Job ${i}` }));
    const packs = Array.from({ length: 21 }, (_, i) => ({ ...PACK, id: `p${i}`, title: `Pack ${i}` }));
    mocks.jobFindMany.mockResolvedValue(jobs);
    mocks.packFindMany.mockResolvedValue(packs);
    render(await SkillsBuilderPage(page()));
    expect(screen.getAllByRole("link", { name: /^Job / })).toHaveLength(20);
    expect(screen.getByRole("link", { name: "Show all jobs" }).getAttribute("href")).toBe("/prompt-bot/skills?all=1");
    const details = screen.getByText("Earlier skill packs").closest("details")!;
    expect(within(details).getAllByRole("link", { name: /^Pack / })).toHaveLength(20);
    expect(within(details).getByRole("link", { name: "Show all packs" }).getAttribute("href")).toBe("/prompt-bot/skills?all=1#earlier-packs");
    cleanup();

    mocks.jobFindMany.mockResolvedValue(jobs.slice(0, 5));
    mocks.packFindMany.mockResolvedValue(packs.slice(0, 5));
    render(await SkillsBuilderPage(page({ all: "1" })));
    expect(mocks.jobFindMany).toHaveBeenLastCalledWith(expect.objectContaining({ take: 201 }));
    expect(mocks.packFindMany).toHaveBeenLastCalledWith(expect.objectContaining({ take: 201 }));
    expect(screen.queryByRole("link", { name: /Show all/ })).toBeNull();
    // Showing everything opens the packs it was asked for.
    expect(screen.getByText("Earlier skill packs").closest("details")!.open).toBe(true);
  });

  it("says when even the full list stops at 200", async () => {
    mocks.jobFindMany.mockResolvedValue(Array.from({ length: 201 }, (_, i) => ({ ...JOB, id: `j${i}`, title: `Job ${i}` })));
    render(await SkillsBuilderPage(page({ all: "1" })));
    expect(screen.getAllByRole("link", { name: /^Job / })).toHaveLength(200);
    expect(screen.getByText("Showing your 200 most recent jobs.")).toBeTruthy();
  });
});
