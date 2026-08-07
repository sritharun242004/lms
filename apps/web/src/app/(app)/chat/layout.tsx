import { getCurrentUser } from "@/lib/auth";
import { getManagedGroups, getJoinedGroups } from "@/lib/groups/queries";
import { ChatShell } from "@/components/chat/chat-shell";

export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) return null; // guarded by (app)/layout.tsx

  const canManage = user.role === "ADMIN" || user.role === "MENTOR";
  const groups = canManage
    ? await getManagedGroups(user.role === "ADMIN" ? {} : { userId: user.id })
    : await getJoinedGroups(user.id);

  // Managers work directly in the active conversation, so their chat view does
  // not include the group list/search sidebar. A mentee in only one group also
  // has nothing to switch between.
  const hideSidebar = canManage || groups.length <= 1;

  return (
    <ChatShell groups={groups} canCreate={canManage} hideSidebar={hideSidebar}>
      {children}
    </ChatShell>
  );
}
