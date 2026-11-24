/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), isAiConfigured: vi.fn(), findMany: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/ai/config", () => ({ isAiConfigured: mocks.isAiConfigured }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { skillPack: { findMany: mocks.findMany } } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), redirect: mocks.redirect }));
afterEach(cleanup);

import SkillsBuilderPage from "./page";

const PACK = {
  id: "p1",
  title: "Board pack",
  updatedAt: new Date("2026-11-24T10:00:00Z"),
  items: [
    { kind: "CUSTOM", status: "READY" },
    { kind: "CUSTOM", status: "DRAFT" },
    { kind: "CATALOG", status: "DRAFT" },
  ],
};

describe("Skills Builder start page", () => {
  it("shows the new-pack form and the user's own packs", async () => {
    mocks.isAiConfigured.mockReturnValue(true);
    mocks.getCurrentUser.mockResolvedValue({ id: "p1user", role: "MENTEE" });
    mocks.findMany.mockResolvedValue([PACK]);
    render(await SkillsBuilderPage());
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "p1user" } }));
    expect(screen.getByRole("heading", { name: "Skills Builder" })).toBeTruthy();
    expect(screen.getByLabelText("Describe a task or your day-to-day work")).toBeTruthy();
    expect(screen.getByLabelText(/Your role/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Board pack/ }).getAttribute("href")).toBe("/prompt-bot/skills/p1");
    expect(screen.getByText("2 skills · 1 ready")).toBeTruthy();
    expect(screen.getByText(/sent to Anthropic's API to build your skills/)).toBeTruthy();
  });

  it("shows the not-configured panel, with the variable name only for admins", async () => {
    mocks.isAiConfigured.mockReturnValue(false);
    mocks.findMany.mockResolvedValue([]);
    mocks.getCurrentUser.mockResolvedValue({ id: "a1", role: "ADMIN" });
    render(await SkillsBuilderPage());
    expect(screen.getByText("Prompt Bot isn't configured yet")).toBeTruthy();
    expect(screen.getByText(/ANTHROPIC_API_KEY/)).toBeTruthy();
    expect(screen.queryByLabelText("Describe a task or your day-to-day work")).toBeNull();
  });

  it("links to the catalog only for coaches and admins", async () => {
    mocks.isAiConfigured.mockReturnValue(true);
    mocks.findMany.mockResolvedValue([]);
    mocks.getCurrentUser.mockResolvedValue({ id: "c1", role: "MENTOR" });
    render(await SkillsBuilderPage());
    expect(screen.getByRole("link", { name: /Manage skill catalog/ }).getAttribute("href")).toBe("/prompt-bot/catalog");
    cleanup();
    mocks.getCurrentUser.mockResolvedValue({ id: "p1user", role: "MENTEE" });
    render(await SkillsBuilderPage());
    expect(screen.queryByRole("link", { name: /Manage skill catalog/ })).toBeNull();
  });
});
