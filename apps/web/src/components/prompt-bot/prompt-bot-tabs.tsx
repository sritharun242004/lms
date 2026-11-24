"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function isSkillsPath(pathname: string): boolean {
  return pathname === "/prompt-bot/skills" || pathname.startsWith("/prompt-bot/skills/") || pathname === "/prompt-bot/catalog";
}

const TABS = [
  { href: "/prompt-bot", label: "Prompt Bot", skills: false },
  { href: "/prompt-bot/skills", label: "Skills Builder", skills: true },
];

export function PromptBotTabs() {
  const inSkills = isSkillsPath(usePathname() ?? "");
  return (
    <nav
      aria-label="Prompt Bot sections"
      className="mx-auto mb-6 flex w-fit items-center gap-1 rounded-xl bg-white/35 p-1 text-sm shadow-[inset_0_1px_rgba(255,255,255,.72)] dark:bg-white/5"
    >
      {TABS.map((tab) => {
        const current = tab.skills === inSkills;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-2 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
              current ? "bg-white/85 text-primary shadow-sm dark:bg-white/10" : "text-muted-foreground hover:bg-white/65 hover:text-primary dark:hover:bg-white/10",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
