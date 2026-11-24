import { redirect } from "next/navigation";
import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { PaletteSwitcher } from "@/components/layout/palette-switcher";
import { UserMenu } from "@/components/layout/user-menu";
import { MobileNav } from "@/components/layout/mobile-nav";
import { DesktopNav } from "@/components/layout/desktop-nav";
import { PromptBotButton } from "@/components/layout/prompt-bot-button";
import { PageMotion } from "@/components/layout/page-motion";
import { AppFrame } from "@/components/layout/app-frame";
import { DEFAULT_PALETTE, isPaletteKey } from "@/lib/theme/palettes";
import { showsPromptBotButton } from "@/lib/prompt-bot/visibility";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const isMentee = user.role === "MENTEE";
  const homeHref = isMentee ? "/chat" : "/dashboard";
  const palette = isPaletteKey(user.themePreference) ? user.themePreference : DEFAULT_PALETTE;

  const header = (
      <header className="sticky top-0 z-40 px-3 pt-3 sm:px-5 sm:pt-4">
        <div className="glass relative mx-auto flex h-16 max-w-[1500px] items-center justify-between rounded-[1.35rem] px-3 sm:px-5">
          <div className="flex items-center gap-2">
            <MobileNav isMentee={isMentee} isSuperAdmin={user.role === "ADMIN"} />
            <Link href={homeHref} className="flex items-center gap-2 font-semibold">
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[0_8px_24px_rgba(37,99,235,.2)]">
                <MessagesSquare className="size-4" />
              </span>
              <span className="hidden sm:inline">AI Empowerment</span>
            </Link>
          </div>
          <DesktopNav isMentee={isMentee} isAdmin={user.role === "ADMIN"} />
          <div className="flex items-center gap-1 sm:gap-2">
            {showsPromptBotButton(user.role) && <PromptBotButton variant={isMentee ? "featured" : "default"} />}
            <PaletteSwitcher initialPalette={palette} />
            <ThemeToggle />
            <UserMenu user={user} />
          </div>
        </div>
      </header>
  );
  return (
    <>
      {/* Corrects <html data-palette> from the root layout's static
          default to this signed-in user's saved choice before paint —
          same flash-avoidance trick next-themes uses for light/dark.
          `palette` is constrained to a fixed PaletteKey enum, never
          arbitrary user input, so this is safe to inline. */}
      <script dangerouslySetInnerHTML={{ __html: `document.documentElement.setAttribute('data-palette','${palette}')` }} />
      <AppFrame header={header}>
        <PageMotion>{children}</PageMotion>
      </AppFrame>
    </>
  );
}
