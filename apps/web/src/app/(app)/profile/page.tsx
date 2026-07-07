import { getCurrentUser } from "@/lib/auth";
import { getInitials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { SecureAccountBanner } from "@/components/auth/secure-account-banner";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) return null; // guarded by layout

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account details</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex items-center gap-4">
            <Avatar className="size-14">
              <AvatarImage src={user.avatarUrl ?? undefined} alt={user.name} />
              <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">{user.name}</p>
              <Badge variant="secondary" className="mt-1">
                {user.role}
              </Badge>
            </div>
          </div>

          <Separator />

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
            {user.email ? (
              <>
                <dt className="text-muted-foreground">Email</dt>
                <dd>{user.email}</dd>
                <dt className="text-muted-foreground">Email verified</dt>
                <dd>{user.emailVerified ? "Yes" : "No"}</dd>
              </>
            ) : (
              <>
                <dt className="text-muted-foreground">Account type</dt>
                <dd>Guest — joined with an invite code, no email or password</dd>
              </>
            )}
          </dl>

          {!user.email && (
            <>
              <Separator />
              <SecureAccountBanner />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
