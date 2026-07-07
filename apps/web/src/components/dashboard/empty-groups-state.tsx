import { LayoutGrid } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function EmptyGroupsState({
  mentee = false,
  action,
}: {
  mentee?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-muted">
          <LayoutGrid className="size-6 text-muted-foreground" />
        </span>
        <h3 className="text-lg font-medium">
          {mentee ? "You haven't joined a group yet" : "You haven't created a group yet"}
        </h3>
        <p className="max-w-sm text-sm text-muted-foreground">
          {mentee
            ? "Ask your mentor for an invite code to join their group."
            : "Create your first group to start sharing announcements with your students."}
        </p>
        {action && <div className="mt-3">{action}</div>}
      </CardContent>
    </Card>
  );
}
