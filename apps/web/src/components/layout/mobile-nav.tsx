"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Library, LayoutDashboard, Menu, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export function MobileNav({ isMentee, isSuperAdmin }: { isMentee: boolean; isSuperAdmin: boolean }) {
  const [isOpen, setIsOpen] = React.useState(false);
  const pathname = usePathname();

  const links = [
    ...(!isMentee ? [{ href: "/questions", label: "Quiz repository", icon: Library }] : []),
    ...(!isMentee ? [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }] : []),
    ...(isSuperAdmin ? [{ href: "/admin/coaches", label: "Participant onboarding", icon: UserPlus }] : []),
  ];

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="sm:hidden" aria-label="Open navigation">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="glass w-72 border-r-white/60">
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-1">
          {links.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setIsOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-white/60 hover:text-primary dark:hover:bg-white/5"
                )}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
