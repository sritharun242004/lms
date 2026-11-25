import { prisma } from "@/lib/db/prisma";

/**
 * Who may use Prompt Bot. Staff (ADMIN, MENTOR) always may. A participant
 * (MENTEE) may only when an admin has turned Prompt Bot on for at least one
 * group they belong to (`Group.promptBotEnabled`). This is the single rule
 * behind the header buttons, the /prompt-bot pages and /api/v1/prompt-bot.
 */

export const PROMPT_BOT_DISABLED_MESSAGE = "Prompt Bot isn't turned on for your group.";

export async function canUsePromptBot(user: { id: string; role: string }): Promise<boolean> {
  if (user.role !== "MENTEE") return true;
  const enabledMemberships = await prisma.groupMember.count({
    where: { userId: user.id, group: { promptBotEnabled: true } },
  });
  return enabledMemberships > 0;
}
