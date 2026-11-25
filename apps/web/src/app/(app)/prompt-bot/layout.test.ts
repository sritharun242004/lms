import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  canUsePromptBot: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/prompt-bot/access", () => ({ canUsePromptBot: mocks.canUsePromptBot }));
vi.mock("@/components/prompt-bot/prompt-bot-tabs", () => ({ PromptBotTabs: () => null }));

import PromptBotLayout from "./layout";

beforeEach(() => vi.clearAllMocks());

describe("Prompt Bot layout gate", () => {
  it("sends a participant without a Prompt Bot group back to chat", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "p1", role: "MENTEE" });
    mocks.canUsePromptBot.mockResolvedValue(false);

    await expect(PromptBotLayout({ children: null })).rejects.toThrow("redirect:/chat");
  });

  it.each([
    ["a participant in an enabled group", "MENTEE"],
    ["staff", "MENTOR"],
  ])("renders for %s", async (_label, role) => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u1", role });
    mocks.canUsePromptBot.mockResolvedValue(true);

    await expect(PromptBotLayout({ children: null })).resolves.toBeTruthy();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.canUsePromptBot).toHaveBeenCalledWith({ id: "u1", role });
  });

  it("sends a signed-out visitor to login", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    await expect(PromptBotLayout({ children: null })).rejects.toThrow("redirect:/login");
  });
});
