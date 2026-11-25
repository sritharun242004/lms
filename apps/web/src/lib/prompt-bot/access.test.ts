import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ memberCount: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { groupMember: { count: mocks.memberCount } } }));

import { PROMPT_BOT_DISABLED_MESSAGE, canUsePromptBot } from "./access";
import { showsPromptBotInGroup } from "./visibility";

beforeEach(() => vi.clearAllMocks());

describe("canUsePromptBot", () => {
  it.each(["ADMIN", "MENTOR"] as const)("always allows %s without a database lookup", async (role) => {
    expect(await canUsePromptBot({ id: "u1", role })).toBe(true);
    expect(mocks.memberCount).not.toHaveBeenCalled();
  });

  it("allows a participant who belongs to a group with Prompt Bot on", async () => {
    mocks.memberCount.mockResolvedValue(1);
    expect(await canUsePromptBot({ id: "p1", role: "MENTEE" })).toBe(true);
    expect(mocks.memberCount).toHaveBeenCalledWith({
      where: { userId: "p1", group: { promptBotEnabled: true } },
    });
  });

  it("refuses a participant whose groups all have Prompt Bot off", async () => {
    mocks.memberCount.mockResolvedValue(0);
    expect(await canUsePromptBot({ id: "p1", role: "MENTEE" })).toBe(false);
  });

  it("explains the refusal in plain words", () => {
    expect(PROMPT_BOT_DISABLED_MESSAGE).toBe("Prompt Bot isn't turned on for your group.");
  });
});

describe("showsPromptBotInGroup", () => {
  it("shows the chat-header button to a participant only when that group has it on", () => {
    expect(showsPromptBotInGroup("MENTEE", true)).toBe(true);
    expect(showsPromptBotInGroup("MENTEE", false)).toBe(false);
  });

  it.each(["ADMIN", "MENTOR"])("always shows it to %s", (role) => {
    expect(showsPromptBotInGroup(role, false)).toBe(true);
  });
});

describe("group Prompt Bot migration", () => {
  const web = path.join(__dirname, "../../..");
  const sql = readFileSync(
    path.join(web, "prisma/migrations/20261127090000_group_prompt_bot_enabled/migration.sql"),
    "utf8"
  );

  it("only adds a defaulted-off column to groups", () => {
    expect(sql).toMatch(
      /ALTER TABLE "groups" ADD COLUMN\s+"prompt_bot_enabled" BOOLEAN NOT NULL DEFAULT false;/
    );
    expect(sql).not.toMatch(/\b(DROP|RENAME|UPDATE|DELETE)\b/i);
  });
});
