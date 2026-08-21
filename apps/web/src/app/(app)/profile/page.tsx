import { getCurrentUser } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ProfilePhotoCard } from '@/components/profile/profile-photo-card';

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) return null; // guarded by layout

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Profile</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account details</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <ProfilePhotoCard user={user} />
          <Badge variant="secondary" className="w-fit">
            {user.role}
          </Badge>

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
                <dd>Guest — joined with a meeting or course code, no email or password</dd>
              </>
            )}
          </dl>

          {!user.email && (
            <>
              <Separator />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
