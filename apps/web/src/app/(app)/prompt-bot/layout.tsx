import type { ReactNode } from "react";
import { PromptBotTabs } from "@/components/prompt-bot/prompt-bot-tabs";

export default function PromptBotLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PromptBotTabs />
      {children}
    </>
  );
}
