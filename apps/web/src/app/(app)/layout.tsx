import { redirect } from "next/navigation";
import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { MobileNav } from "@/components/layout/mobile-nav";

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
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <div className="relative flex h-14 items-center justify-between px-3 sm:px-4 md:px-6">
          <div className="flex items-center gap-2">
            <MobileNav isMentee={isMentee} />
            <Link href={homeHref} className="flex items-center gap-2 font-semibold">
              <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <MessagesSquare className="size-4" />
              </span>
              <span className="hidden sm:inline">Mentor Connect</span>
            </Link>
          </div>
          <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-4 text-sm sm:flex">
            {!isMentee && (
              <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">
                Dashboard
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
      <main className="flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}
