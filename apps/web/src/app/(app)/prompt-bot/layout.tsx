import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canUsePromptBot } from "@/lib/prompt-bot/access";
import { PromptBotTabs } from "@/components/prompt-bot/prompt-bot-tabs";

export default async function PromptBotLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // The proxy gates first; this keeps the pages closed if it is ever bypassed.
  if (!(await canUsePromptBot(user))) redirect("/chat");

  return (
    <>
      <PromptBotTabs />
      {children}
    </>
  );
}
