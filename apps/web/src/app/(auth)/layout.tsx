import Link from "next/link";
import { Check, MessageSquareText, MessagesSquare, Radio, Users } from "lucide-react";
import { PageMotion } from "@/components/layout/page-motion";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative grid min-h-svh overflow-hidden bg-[#060a07] text-[#dee4dd] lg:grid-cols-[.92fr_1.08fr]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_65%_55%_at_85%_10%,rgba(119,255,97,.12),transparent_64%),radial-gradient(ellipse_45%_35%_at_5%_85%,rgba(69,253,165,.055),transparent_72%)]" />
      <div className="relative z-10 flex min-h-svh flex-col gap-6 p-5 sm:p-8 md:p-10 lg:p-12">
        <div className="flex justify-center md:justify-start">
          <Link href="/" className="flex items-center gap-3 font-semibold tracking-wide">
            <span className="flex size-9 items-center justify-center rounded-xl bg-[#77ff61] text-[#013a00] shadow-[0_0_30px_rgba(119,255,97,.22)]">
              <MessagesSquare className="size-4" />
            </span>
            AI Empowerment
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center py-8">
          <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white/[.035] p-6 shadow-[0_28px_80px_rgba(0,0,0,.36)] backdrop-blur-2xl sm:p-8">
            <PageMotion>{children}</PageMotion>
          </div>
        </div>
      </div>

      <div className="relative z-10 hidden items-center justify-center border-l border-white/8 p-10 lg:flex xl:p-16">
        <div className="w-full max-w-2xl">
          <p className="text-xs font-medium tracking-[.16em] text-[#77ff61] uppercase">Participant portal</p>
          <h2 className="mt-4 max-w-xl text-5xl leading-[1.02] font-semibold tracking-[-.045em] text-balance xl:text-6xl">One focused place for every group update.</h2>
          <p className="mt-5 max-w-lg text-lg leading-8 font-light text-[#b9ccaf]">Announcements, polls, resources, and member activity stay clear and easy to find.</p>
          <div className="mt-10 overflow-hidden rounded-[2rem] border border-white/10 bg-white/[.04] p-5 shadow-[0_30px_100px_rgba(0,0,0,.45)] backdrop-blur-2xl">
            <div className="flex items-center justify-between border-b border-white/8 pb-4"><div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-full bg-[#77ff61]/10 text-[#77ff61]"><Users className="size-4" /></span><div><p className="text-sm font-medium">Coach community</p><p className="text-xs text-[#84967c]">Invite-only group</p></div></div><span className="flex items-center gap-1.5 rounded-full border border-[#77ff61]/15 bg-[#77ff61]/[.06] px-2.5 py-1 text-[11px] text-[#77ff61]"><Radio className="size-3" /> Live</span></div>
            <div className="my-4 rounded-2xl border border-[#77ff61]/15 bg-[#77ff61]/[.055] p-4"><p className="flex items-center gap-2 text-xs text-[#77ff61]"><MessageSquareText className="size-3.5" /> New announcement</p><p className="mt-3 font-medium">Your next workshop brief is ready</p><p className="mt-1.5 text-sm leading-6 text-[#b9ccaf]">Open the pinned resource before tomorrow’s live session.</p></div>
            <div className="ml-auto flex w-[76%] items-center gap-3 rounded-2xl border border-white/8 bg-[#0a0f0c]/55 p-3"><span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#77ff61] text-[#013a00]"><Check className="size-4" /></span><div><p className="text-xs font-medium">Delivered securely</p><p className="text-[11px] text-[#84967c]">Private to group members</p></div></div>
          </div>
        </div>
      </div>
    </div>
  );
}
