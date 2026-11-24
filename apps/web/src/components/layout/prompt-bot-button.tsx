"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const PROMPT_BOT_HREF = "/prompt-bot";

export function PromptBotButton() {
  const pathname = usePathname();
  const isActive = pathname === PROMPT_BOT_HREF || pathname.startsWith(`${PROMPT_BOT_HREF}/`);

  return (
    <Link
      href={PROMPT_BOT_HREF}
      aria-label="Prompt Bot"
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold text-primary outline-none transition-colors duration-200 motion-reduce:transition-none",
        "focus-visible:ring-[3px] focus-visible:ring-ring/30 sm:h-9 sm:w-auto sm:px-3.5",
        isActive ? "bg-primary/20 ring-1 ring-primary/25" : "bg-primary/10 hover:bg-primary/15"
      )}
    >
      <Sparkles className="size-4" aria-hidden="true" />
      <span className="hidden sm:inline">Prompt Bot</span>
    </Link>
  );
}
