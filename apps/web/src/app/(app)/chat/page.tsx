import { MessagesSquare } from "lucide-react";

export default function ChatIndexPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
      <MessagesSquare className="size-10" />
      <p className="text-sm">Select a group from the list to start chatting</p>
    </div>
  );
}
