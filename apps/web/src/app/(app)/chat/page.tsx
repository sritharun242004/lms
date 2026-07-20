import { redirect } from "next/navigation";
import { MessagesSquare } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getJoinedGroups } from "@/lib/groups/queries";

export default async function ChatIndexPage() {
  const user = await getCurrentUser();
  if (user && user.role !== "ADMIN" && user.role !== "MENTOR") {
    const groups = await getJoinedGroups(user.id);
    if (groups.length === 1) redirect(`/chat/${groups[0].id}`);
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
      <MessagesSquare className="size-10" />
      <p className="text-sm">Select a group from the list to start chatting</p>
    </div>
  );
}
