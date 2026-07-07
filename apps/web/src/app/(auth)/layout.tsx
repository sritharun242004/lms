import Link from "next/link";
import { MessagesSquare } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      {/* Form column */}
      <div className="flex flex-col gap-6 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <MessagesSquare className="size-4" />
            </span>
            Mentor Connect
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>

      {/* Brand column */}
      <div className="relative hidden bg-primary lg:block">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "32px 32px",
          }}
        />
        <div className="relative flex h-full flex-col items-start justify-end gap-4 p-12 text-primary-foreground">
          <h2 className="text-3xl font-semibold leading-tight text-balance">
            Where mentors and mentees stay connected.
          </h2>
          <p className="max-w-md text-base text-primary-foreground/80">
            Announcement groups, real-time chat, and invite-only communities —
            built for modern mentorship programs.
          </p>
        </div>
      </div>
    </div>
  );
}
