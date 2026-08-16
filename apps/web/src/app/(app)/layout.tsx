import { redirect } from "next/navigation";
import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { MobileNav } from "@/components/layout/mobile-nav";
import { PageMotion } from "@/components/layout/page-motion";

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

  return (
    <div className="relative flex min-h-svh flex-col overflow-x-hidden bg-[#060a07] text-[#dee4dd]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_60%_45%_at_88%_0%,rgba(119,255,97,.09),transparent_65%),radial-gradient(ellipse_40%_35%_at_0%_100%,rgba(69,253,165,.04),transparent_72%)]" />
      <header className="sticky top-0 z-40 px-3 pt-3 sm:px-5 sm:pt-4">
        <div className="relative mx-auto flex h-14 max-w-[1500px] items-center justify-between rounded-2xl border border-white/10 bg-[#0a0f0c]/72 px-3 shadow-[0_14px_45px_rgba(0,0,0,.3)] backdrop-blur-2xl sm:px-5">
          <div className="flex items-center gap-2">
            <MobileNav isMentee={isMentee} isSuperAdmin={user.role === "ADMIN"} />
            <Link href={homeHref} className="flex items-center gap-2 font-semibold">
              <span className="flex size-8 items-center justify-center rounded-xl bg-[#77ff61] text-[#013a00] shadow-[0_0_24px_rgba(119,255,97,.2)]">
                <MessagesSquare className="size-4" />
              </span>
              <span className="hidden sm:inline">AI Empowerment</span>
            </Link>
          </div>
          <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-4 text-sm sm:flex">
            {!isMentee && (
              <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">
                Dashboard
              </Link>
            )}
            {!isMentee && <Link href="/questions" className="text-muted-foreground hover:text-foreground">Question library</Link>}
            {user.role === "ADMIN" && (
              <Link href="/admin/coaches" className="text-muted-foreground hover:text-foreground">
                Coach onboarding
              </Link>
            )}
            <Link href="/chat" className="text-muted-foreground hover:text-foreground">
              Chats
            </Link>
          </nav>
          <div className="flex items-center gap-1 sm:gap-2">
            <ThemeToggle />
            <UserMenu user={user} />
          </div>
        </div>
      </header>
      <main className="relative z-10 flex-1 p-4 pt-6 md:p-6 md:pt-8"><PageMotion>{children}</PageMotion></main>
    </div>
  );
}
