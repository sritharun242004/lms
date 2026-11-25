/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), findMany: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { skillPack: { findMany: mocks.findMany } } }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
afterEach(cleanup);

import SkillsBuilderPage from "./page";

describe("Skills Builder start page (interim)", () => {
  it("lists earlier packs as read-only links and no catalog link", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "c1", role: "MENTOR" });
    mocks.findMany.mockResolvedValue([{ id: "p1", title: "Board pack", updatedAt: new Date("2026-11-24T10:00:00Z") }]);
    render(await SkillsBuilderPage());
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "c1" } }));
    expect(screen.getByRole("heading", { name: "Skills Builder" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Board pack/ }).getAttribute("href")).toBe("/prompt-bot/skills/legacy/p1");
    expect(screen.getByText("Read-only")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /catalog/i })).toBeNull();
  });
});
