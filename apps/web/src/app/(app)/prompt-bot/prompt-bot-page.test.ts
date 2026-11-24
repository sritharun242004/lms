/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), isAiConfigured: vi.fn(), findMany: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/ai/config", () => ({ isAiConfigured: mocks.isAiConfigured }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/prompt-bot/sessions", () => ({ recentSessions: mocks.findMany }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), redirect: vi.fn() }));
afterEach(cleanup);

import PromptBotPage from "./page";

const DAY = 86_400_000;
const session = (id: string, title: string, daysAgo: number, answered: number, relevant: number, total: number) => ({
  id,
  title,
  updatedAt: new Date(Date.now() - daysAgo * DAY),
  answered,
  relevant,
  ratio: answered / Math.max(1, total),
});

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
    mocks.findMany.mockResolvedValue([
      session("s2", "Launch post", 0.4, 4, 7, 1),
      session("s1", "Board update email", 30, 7, 7, 7),
    ]);
    render(await PromptBotPage());
    expect(screen.getByRole("heading", { name: "Prompt Bot" })).toBeTruthy();
    expect(screen.getByLabelText("What do you want AI to do?")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Board update email/ }).getAttribute("href")).toBe("/prompt-bot/s1");
  });

  it("puts the most recent session from the last week first, as Continue, with its progress", async () => {
    mocks.isAiConfigured.mockReturnValue(true);
    mocks.getCurrentUser.mockResolvedValue({ id: "p1", role: "MENTEE", name: "Ravi" });
    mocks.findMany.mockResolvedValue([session("s2", "Launch post", 0.4, 4, 7, 1), session("s1", "Board update email", 30, 7, 7, 7)]);
    render(await PromptBotPage());
    const resume = screen.getByRole("link", { name: /Continue: Launch post/ });
    expect(resume.getAttribute("href")).toBe("/prompt-bot/s2");
    expect(resume.textContent).toContain("4 of 7 ready");
    // It comes before the start form, and the recent list doesn't repeat it.
    const form = screen.getByLabelText("What do you want AI to do?");
    expect(resume.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /Launch post/ })).toHaveLength(1);
  });

  it("does not offer to continue a session untouched for more than a week", async () => {
    mocks.isAiConfigured.mockReturnValue(true);
    mocks.getCurrentUser.mockResolvedValue({ id: "p1", role: "MENTEE", name: "Ravi" });
    mocks.findMany.mockResolvedValue([session("s1", "Board update email", 8, 7, 7, 7)]);
    render(await PromptBotPage());
    expect(screen.queryByRole("link", { name: /Continue:/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Board update email/ })).toBeTruthy();
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
