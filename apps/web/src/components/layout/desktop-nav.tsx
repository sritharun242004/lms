"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function DesktopNav({ isMentee, isAdmin }: { isMentee: boolean; isAdmin: boolean }) {
  const pathname = usePathname();

  const links = [
    ...(!isMentee ? [{ href: "/dashboard", label: "Dashboard" }] : []),
    ...(!isMentee ? [{ href: "/questions", label: "Question Repository" }] : []),
    ...(!isMentee ? [{ href: "/forms", label: "Forms & Feedback", matchPrefixes: ["/forms", "/feedback"] }] : []),
    ...(isAdmin ? [{ href: "/admin/coaches", label: "Coach Management" }] : []),
    ...(isAdmin ? [{ href: "/admin/registrations", label: "Workshop Registrations" }] : []),
  ];

  return (
    // The admin set needs ~800px on one line; below xl the centred bar would
    // run under the brand and header buttons, so MobileNav takes over there.
    <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 rounded-xl bg-white/35 p-1 text-sm shadow-[inset_0_1px_rgba(255,255,255,.72)] xl:flex dark:bg-white/5">
      {links.map(({ href, label, matchPrefixes }) => {
        const prefixes = matchPrefixes ?? [href];
        const isActive = prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-lg px-3 py-2 transition-colors",
              isActive
                ? "bg-primary/10 font-semibold text-primary"
                : "text-muted-foreground hover:bg-white/65 hover:text-primary dark:hover:bg-white/10"
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
