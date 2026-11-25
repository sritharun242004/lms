/**
 * Client-safe Prompt Bot visibility rules (no database access).
 * Server-side access is `canUsePromptBot` in ./access.
 */

/** Chat-header rule for one group: participants see the button only where an admin turned it on. */
export function showsPromptBotInGroup(role: string, groupPromptBotEnabled: boolean): boolean {
  return role !== "MENTEE" || groupPromptBotEnabled;
}
