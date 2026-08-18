import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import { PageMotion } from "@/components/layout/page-motion";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-svh overflow-hidden text-foreground">
      <div className="ambient-orb -top-40 -right-32 size-[38rem] bg-primary/24" />
      <div className="ambient-orb -bottom-44 -left-36 size-[34rem] bg-brand-200/60 [animation-delay:-7s]" />
      <div className="relative z-10 mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-6 p-5 sm:p-8 md:p-10 lg:p-12">
        <div className="flex justify-center">
          <Link href="/" className="flex items-center gap-3 font-semibold tracking-wide">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[0_10px_28px_rgba(37,99,235,.22)]">
              <MessagesSquare className="size-4" />
            </span>
            AI Empowerment
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center py-8">
          <div className="glass w-full max-w-md rounded-[2rem] p-6 sm:p-8">
            <PageMotion>{children}</PageMotion>
          </div>
        </div>
      </div>

    </div>
  );
}
