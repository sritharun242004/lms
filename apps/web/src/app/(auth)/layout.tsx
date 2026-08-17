import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import { PageMotion } from "@/components/layout/page-motion";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative grid min-h-svh overflow-hidden text-foreground lg:grid-cols-[.92fr_1.08fr]">
      <div className="ambient-orb -top-40 -right-32 size-[38rem] bg-primary/24" />
      <div className="ambient-orb -bottom-44 -left-36 size-[34rem] bg-brand-200/60 [animation-delay:-7s]" />
      <div className="relative z-10 flex min-h-svh flex-col gap-6 p-5 sm:p-8 md:p-10 lg:p-12">
        <div className="flex justify-center md:justify-start">
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

      <div className="relative z-10 hidden items-center justify-center border-l border-white/55 bg-white/16 p-10 backdrop-blur-sm lg:flex xl:p-16 dark:border-white/10 dark:bg-white/[.02]">
        <div className="w-full max-w-2xl">
          <p className="text-xs font-semibold tracking-[.16em] text-primary uppercase">Participant portal</p>
          <h2 className="mt-4 max-w-xl text-5xl leading-[1.02] font-semibold tracking-[-.045em] text-balance xl:text-6xl">Enter with your name and meeting code.</h2>
          <div className="glass mt-10 grid gap-5 rounded-[2rem] p-6"><div><p className="text-xs font-semibold text-primary uppercase">Name</p><p className="mt-2 text-muted-foreground">Your display name</p></div><div><p className="text-xs font-semibold text-primary uppercase">Meeting or course code</p><p className="mt-2 text-muted-foreground">The code shared with you</p></div></div>
        </div>
      </div>
    </div>
  );
}
