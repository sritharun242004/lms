import Link from "next/link";
import { redirect } from "next/navigation";
import { MessagesSquare, ShieldCheck, Users, Pin } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export default async function Home() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-16 items-center justify-between border-b border-border px-4 md:px-8">
        <div className="flex items-center gap-2 font-semibold">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <MessagesSquare className="size-4" />
          </span>
          Mentor Connect
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" asChild>
            <Link href="/login">Mentor sign in</Link>
          </Button>
          <Button asChild>
            <Link href="/join">Join a group</Link>
          </Button>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-10 px-4 py-20 text-center">
        <div className="flex max-w-2xl flex-col items-center gap-5">
          <span className="rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
            A modern Learning Management Portal
          </span>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Mentorship communication, done the WhatsApp way.
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground text-balance">
            Mentors broadcast to read-only announcement groups. Mentees stay in the loop.
            Invite codes make joining effortless.
          </p>
          <div className="flex items-center gap-3">
            <Button size="lg" asChild>
              <Link href="/join">Join with an invite code</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/login">Mentor sign in</Link>
            </Button>
          </div>
        </div>

        <div className="grid w-full max-w-4xl grid-cols-1 gap-4 sm:grid-cols-3">
          <FeatureCard
            icon={Users}
            title="Invite-only groups"
            description="Unique, regeneratable invite codes keep every group private."
          />
          <FeatureCard
            icon={Pin}
            title="Pinned announcements"
            description="Important updates never get lost in the scroll."
          />
          <FeatureCard
            icon={ShieldCheck}
            title="Full audit trail"
            description="Every edit and deletion is versioned, never overwritten."
          />
        </div>
      </main>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Users;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-6 text-center">
      <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-5" />
      </span>
      <h3 className="font-medium">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
