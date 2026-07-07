import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getGroupAccess } from "@/lib/groups/access";
import { getGroupHeader, getInitialMessages } from "@/lib/messages/queries";
import { ChatThread } from "@/components/chat/chat-thread";

export default async function GroupChatPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { groupId } = await params;
  const access = await getGroupAccess(groupId, user);
  if (!access.canView) notFound();

  const group = await getGroupHeader(groupId);
  if (!group) notFound();

  const { messages, hasMore } = await getInitialMessages(groupId);

  return (
    <ChatThread
      key={groupId}
      groupId={groupId}
      groupName={group.name}
      memberCount={group._count.members}
      currentUserId={user.id}
      canManage={access.canManage}
      initialMessages={messages}
      initialHasMore={hasMore}
    />
  );
}
