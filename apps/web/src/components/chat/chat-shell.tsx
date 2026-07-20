"use client";

import { usePathname } from "next/navigation";
import type { GroupCard as GroupCardData } from "@/lib/api/services/group-service";
import { ChatSidebar } from "@/components/chat/chat-sidebar";
import { cn } from "@/lib/utils";

/**
 * `/chat` shows only the group list on mobile; `/chat/[groupId]` shows only the
 * thread, with a back button in ChatThread returning here. md+ shows both panes.
 *
 * `hideSidebar` drops the group list entirely (mobile and desktop) — used for
 * mentees in a single group, who have nothing to switch between.
 */
export function ChatShell({
  groups,
  canCreate,
  hideSidebar = false,
  children,
}: {
  groups: GroupCardData[];
  canCreate: boolean;
  hideSidebar?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const hasActiveGroup = pathname !== "/chat";

  if (hideSidebar) {
    return (
      <div className="-m-4 flex h-[calc(100svh-3.5rem)] overflow-x-hidden md:-m-6">
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
    );
  }

  return (
    <div className="-m-4 flex h-[calc(100svh-3.5rem)] overflow-x-hidden md:-m-6">
      <div className={cn("h-full", hasActiveGroup ? "hidden md:flex" : "flex w-full md:w-auto")}>
        <ChatSidebar groups={groups} canCreate={canCreate} />
      </div>
      <div className={cn("min-w-0 flex-1 flex-col", hasActiveGroup ? "flex" : "hidden md:flex")}>
        {children}
      </div>
    </div>
  );
}
