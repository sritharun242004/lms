import { describe, expect, it } from "vitest";
import { PROMPT_BOT_BUTTON_FOR_PARTICIPANTS, showsPromptBotButton } from "./visibility";

describe("Prompt Bot button visibility", () => {
  it("is hidden from participants while the switch is off", () => {
    expect(PROMPT_BOT_BUTTON_FOR_PARTICIPANTS).toBe(false);
    expect(showsPromptBotButton("MENTEE")).toBe(false);
  });

  it.each(["ADMIN", "MENTOR"])("stays visible for %s", (role) => {
    expect(showsPromptBotButton(role)).toBe(true);
  });
});
