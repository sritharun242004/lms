/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), isAiConfigured: vi.fn(), findMany: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/ai/config", () => ({ isAiConfigured: mocks.isAiConfigured }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { promptBotSession: { findMany: mocks.findMany } } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), redirect: vi.fn() }));
afterEach(cleanup);

import PromptBotPage from "./page";

describe("Prompt Bot start page", () => {
  it("shows the not-configured panel, with the variable name only for admins", async () => {
    mocks.isAiConfigured.mockReturnValue(false);
    mocks.getCurrentUser.mockResolvedValue({ id: "a1", role: "ADMIN", name: "Admin" });
    mocks.findMany.mockResolvedValue([]);
    render(await PromptBotPage());
    expect(screen.getByText("Prompt Bot isn't configured yet")).toBeTruthy();
    expect(screen.getByText(/ANTHROPIC_API_KEY/)).toBeTruthy();

    cleanup();
    mocks.getCurrentUser.mockResolvedValue({ id: "p1", role: "MENTEE", name: "Ravi" });
    render(await PromptBotPage());
    expect(screen.queryByText(/ANTHROPIC_API_KEY/)).toBeNull();
  });

  it("shows the start form and recent sessions for a participant", async () => {
    mocks.isAiConfigured.mockReturnValue(true);
    mocks.getCurrentUser.mockResolvedValue({ id: "p1", role: "MENTEE", name: "Ravi" });
    mocks.findMany.mockResolvedValue([{ id: "s1", title: "Board update email", updatedAt: new Date("2026-11-24T10:00:00Z") }]);
    render(await PromptBotPage());
    expect(screen.getByRole("heading", { name: "Prompt Bot" })).toBeTruthy();
    expect(screen.getByLabelText("What do you want AI to do?")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Board update email/ }).getAttribute("href")).toBe("/prompt-bot/s1");
  });

  it("shows Manage questions only to coaches and admins", async () => {
    mocks.isAiConfigured.mockReturnValue(true);
    mocks.findMany.mockResolvedValue([]);
    mocks.getCurrentUser.mockResolvedValue({ id: "c1", role: "MENTOR", name: "Coach" });
    render(await PromptBotPage());
    expect(screen.getByRole("link", { name: /Manage questions/ }).getAttribute("href")).toBe("/prompt-bot/matrices");

    cleanup();
    mocks.getCurrentUser.mockResolvedValue({ id: "p1", role: "MENTEE", name: "Ravi" });
    render(await PromptBotPage());
    expect(screen.queryByRole("link", { name: /Manage questions/ })).toBeNull();
  });
});
