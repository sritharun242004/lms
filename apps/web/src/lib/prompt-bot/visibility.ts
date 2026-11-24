/**
 * Whether participants (MENTEE) see the Prompt Bot header button.
 * Hidden for now; flip to true to show participants the featured button again.
 * This only hides the entry point — /prompt-bot itself stays reachable for every role.
 */
export const PROMPT_BOT_BUTTON_FOR_PARTICIPANTS = false;

export function showsPromptBotButton(role: string): boolean {
  return role !== "MENTEE" || PROMPT_BOT_BUTTON_FOR_PARTICIPANTS;
}
