import Link from "next/link";
import { Check, MessageSquareText, MessagesSquare, Radio, Users } from "lucide-react";
import { PageMotion } from "@/components/layout/page-motion";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative grid min-h-svh overflow-hidden text-foreground lg:grid-cols-[.92fr_1.08fr]">
      <div className="ambient-orb -top-40 -right-32 size-[38rem] bg-primary/24" />
      <div className="ambient-orb -bottom-44 -left-36 size-[34rem] bg-brand-200/60 [animation-delay:-7s]" />
      <div className="relative z-10 flex min-h-svh flex-col gap-6 p-5 sm:p-8 md:p-10 lg:p-12">
        <div className="flex justify-center md:justify-start">
          <Link href="/" className="flex items-center gap-3 font-semibold tracking-wide">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[0_10px_28px_rgba(71,102,75,.22)]">
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
          <h2 className="mt-4 max-w-xl text-5xl leading-[1.02] font-semibold tracking-[-.045em] text-balance xl:text-6xl">One focused place for every group update.</h2>
          <p className="mt-5 max-w-lg text-lg leading-8 text-muted-foreground">Announcements, polls, resources, and member activity stay clear and easy to find.</p>
          <div className="glass mt-10 overflow-hidden rounded-[2rem] p-5">
            <div className="flex items-center justify-between border-b border-border/60 pb-4"><div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Users className="size-4" /></span><div><p className="text-sm font-semibold">Coach community</p><p className="text-xs text-muted-foreground">Invite-only group</p></div></div><span className="flex items-center gap-1.5 rounded-lg bg-primary/8 px-2.5 py-1 text-[11px] font-semibold text-primary"><Radio className="size-3" /> Live</span></div>
            <div className="my-4 rounded-2xl bg-brand-100/65 p-4 dark:bg-primary/10"><p className="flex items-center gap-2 text-xs font-semibold text-primary"><MessageSquareText className="size-3.5" /> New announcement</p><p className="mt-3 font-semibold">Your next workshop brief is ready</p><p className="mt-1.5 text-sm leading-6 text-muted-foreground">Open the pinned resource before tomorrow’s live session.</p></div>
            <div className="ml-auto flex w-[76%] items-center gap-3 rounded-2xl bg-white/70 p-3 shadow-sm dark:bg-white/5"><span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Check className="size-4" /></span><div><p className="text-xs font-semibold">Delivered securely</p><p className="text-[11px] text-muted-foreground">Private to group members</p></div></div>
          </div>
        </div>
      </div>
    </div>
  );
}
