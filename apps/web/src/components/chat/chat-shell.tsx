"use client";

import { usePathname } from "next/navigation";
import type { GroupCard as GroupCardData } from "@/lib/api/services/group-service";
import { ChatSidebar } from "@/components/chat/chat-sidebar";
import { cn } from "@/lib/utils";

/**
 * `/chat` shows only the group list on mobile; `/chat/[groupId]` shows only the
 * thread, with a back button in ChatThread returning here. md+ shows both panes.
 */
export function ChatShell({
  groups,
  canCreate,
  children,
}: {
  groups: GroupCardData[];
  canCreate: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const hasActiveGroup = pathname !== "/chat";

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
