import { redirect } from "next/navigation";
import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { MobileNav } from "@/components/layout/mobile-nav";
import { PageMotion } from "@/components/layout/page-motion";
import { AppFrame } from "@/components/layout/app-frame";

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
          <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 rounded-xl bg-white/35 p-1 text-sm shadow-[inset_0_1px_rgba(255,255,255,.72)] md:flex dark:bg-white/5">
            {!isMentee && <Link href="/questions" className="rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-white/65 hover:text-primary dark:hover:bg-white/10">Quiz repository</Link>}
            {!isMentee && (
              <Link href="/dashboard" className="rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-white/65 hover:text-primary dark:hover:bg-white/10">
                Dashboard
              </Link>
            )}
            {user.role === "ADMIN" && (
              <Link href="/admin/coaches" className="rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-white/65 hover:text-primary dark:hover:bg-white/10">
                Coach account management
              </Link>
            )}
          </nav>
          <div className="flex items-center gap-1 sm:gap-2">
            <ThemeToggle />
            <UserMenu user={user} />
          </div>
        </div>
      </header>
  );
  return (
    <AppFrame header={header}>
      <PageMotion>{children}</PageMotion>
    </AppFrame>
  );
}
