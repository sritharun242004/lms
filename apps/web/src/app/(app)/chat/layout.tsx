import { getCurrentUser } from "@/lib/auth";
import { getManagedGroups, getJoinedGroups } from "@/lib/groups/queries";
import { ChatSidebar } from "@/components/chat/chat-sidebar";

export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) return null; // guarded by (app)/layout.tsx

  const canManage = user.role === "ADMIN" || user.role === "MENTOR";
  const groups = canManage
    ? await getManagedGroups(user.role === "ADMIN" ? {} : { userId: user.id })
    : await getJoinedGroups(user.id);

  return (
    <div className="-m-4 flex h-[calc(100svh-3.5rem)] md:-m-6">
      <ChatSidebar groups={groups} canCreate={canManage} />
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
