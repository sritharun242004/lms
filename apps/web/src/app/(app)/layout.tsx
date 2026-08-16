import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { MobileNav } from "@/components/layout/mobile-nav";
import { PageMotion } from "@/components/layout/page-motion";
import { AppFrame } from "@/components/layout/app-frame";
import { BrandLogo } from "@/components/layout/brand-logo";

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
            <Link href={homeHref} aria-label="CMS AI Empowerment home">
              <BrandLogo priority className="w-28 shadow-[0_8px_24px_rgba(71,102,75,.18)] sm:w-36" />
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
                Participant onboarding
              </Link>
            )}
            <Link href="/chat" className="rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-white/65 hover:text-primary dark:hover:bg-white/10">
              Chats
            </Link>
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
