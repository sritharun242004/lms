"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const PROMPT_BOT_HREF = "/prompt-bot";

export type PromptBotButtonVariant = "default" | "featured";

export function PromptBotButton({ variant = "default" }: { variant?: PromptBotButtonVariant }) {
  const pathname = usePathname();
  const isActive = pathname === PROMPT_BOT_HREF || pathname.startsWith(`${PROMPT_BOT_HREF}/`);

  const featured = variant === "featured";

  return (
    <Link
      href={PROMPT_BOT_HREF}
      aria-label="Prompt Bot"
      aria-current={isActive ? "page" : undefined}
      data-variant={variant}
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap text-sm font-semibold outline-none motion-reduce:transition-none",
        "focus-visible:ring-[3px] focus-visible:ring-ring/30 sm:h-9 sm:w-auto sm:px-3.5",
        featured
          ? [
              "rounded-full bg-gradient-to-b from-[color-mix(in_oklab,var(--primary),white_16%)] to-primary text-primary-foreground",
              "shadow-[0_4px_14px_-4px_color-mix(in_oklab,var(--primary)_65%,transparent)] transition-[transform,box-shadow,opacity] duration-200 ease-out",
              "hover:-translate-y-px hover:shadow-[0_8px_20px_-6px_color-mix(in_oklab,var(--primary)_75%,transparent)] active:translate-y-0 active:opacity-90",
              "focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              isActive && "ring-2 ring-primary/40 ring-offset-2 ring-offset-background",
            ]
          : [
              "rounded-xl text-primary transition-colors duration-200",
              isActive ? "bg-primary/20 ring-1 ring-primary/25" : "bg-primary/10 hover:bg-primary/15",
            ]
      )}
    >
      <Sparkles className={cn("size-4", featured && "prompt-bot-sparkle")} aria-hidden="true" />
      <span className="hidden sm:inline">Prompt Bot</span>
    </Link>
  );
}
