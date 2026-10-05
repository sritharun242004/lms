"use client";

import { useRouter } from "next/navigation";
import { LogOut, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import type { AuthUser } from "@cms/shared";
import { useAuth } from "@/providers/auth-provider";
import { getInitials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/hooks/use-confirm";
import { visibleRoleLabel } from "@/lib/cms/task-requirements";
import { canonicalLoginPath, portalForRole } from "@/lib/auth/portal-navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu({ user }: { user: AuthUser }) {
  const router = useRouter();
  const { logout } = useAuth();
  const [confirm, confirmDialog] = useConfirm();

  async function handleLogout() {
    await logout();
    toast.success("Signed out");
    router.push(canonicalLoginPath(portalForRole(user.role)));
  }

  async function requestLogout() {
    const confirmed = await confirm({
      title: "Log out?",
      description: "Do you want to log out?",
      confirmLabel: "Log out",
      destructive: true,
    });

    if (confirmed) await handleLogout();
  }

  return (
    <>
      {user.role === "MENTEE" && (
        <Button variant="outline" size="sm" onClick={requestLogout}>
          <LogOut />
          Log out
        </Button>
      )}
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
        <Avatar>
          <AvatarImage src={user.avatarUrl ?? undefined} alt={user.name} />
          <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-foreground">{user.name}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {user.email ? `${user.email} · ` : ""}
            {visibleRoleLabel(user.role)}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push("/profile")}>
          <UserIcon />
          Profile
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={requestLogout}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
      {confirmDialog}
    </>
  );
}
