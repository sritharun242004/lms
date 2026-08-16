"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Check, MessageSquareText, MessagesSquare, Pin, Radio, ShieldCheck, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

const ease = [0.16, 1, 0.3, 1] as const;

export function LandingPage() {
  const reduceMotion = useReducedMotion();
  const rise = (delay = 0) => ({ initial: reduceMotion ? false : { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.65, delay, ease } });

  return (
    <div className="relative min-h-svh overflow-hidden bg-[#060a07] text-[#dee4dd] selection:bg-[#77ff61] selection:text-[#013a00]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_65%_55%_at_78%_8%,rgba(119,255,97,.13),transparent_62%),radial-gradient(ellipse_45%_35%_at_8%_72%,rgba(69,253,165,.055),transparent_72%)]" />
      <div className="pointer-events-none fixed inset-0 opacity-[.025] [background-image:linear-gradient(rgba(255,255,255,.55)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.55)_1px,transparent_1px)] [background-size:72px_72px]" />

      <header className="sticky top-0 z-50 px-3 pt-3 sm:px-6 sm:pt-5">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between rounded-2xl border border-white/10 bg-[#0a0f0c]/70 px-4 shadow-[0_14px_50px_rgba(0,0,0,.28)] backdrop-blur-2xl sm:px-6">
          <Link href="/" className="flex items-center gap-3 font-semibold tracking-wide"><span className="flex size-9 items-center justify-center rounded-xl bg-[#77ff61] text-[#013a00] shadow-[0_0_30px_rgba(119,255,97,.25)]"><MessagesSquare className="size-4.5" /></span><span>AI Empowerment</span></Link>
          <div className="flex items-center gap-1.5 sm:gap-3"><Button variant="ghost" className="hidden text-[#dee4dd] hover:bg-white/5 hover:text-[#77ff61] sm:inline-flex" asChild><Link href="/login">Coach sign in</Link></Button><Button className="h-10 bg-[#77ff61] px-4 text-[#013a00] shadow-[0_8px_28px_rgba(119,255,97,.2)] hover:bg-[#8dff79] sm:px-5" asChild><Link href="/join">Join a group <ArrowRight className="size-4" /></Link></Button></div>
        </div>
      </header>

      <main className="relative z-10">
        <section className="mx-auto grid min-h-[calc(100svh-92px)] max-w-7xl items-center gap-14 px-5 py-16 lg:grid-cols-[1.05fr_.95fr] lg:px-8 lg:py-20">
          <div className="max-w-3xl">
            <motion.div {...rise()} className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#77ff61]/20 bg-[#77ff61]/[.07] px-3.5 py-1.5 text-xs font-medium tracking-[.12em] text-[#77ff61] uppercase backdrop-blur-xl"><Sparkles className="size-3.5" /> One channel. Everyone aligned.</motion.div>
            <motion.h1 {...rise(.06)} className="text-[clamp(3rem,7vw,6.8rem)] leading-[.92] font-semibold tracking-[-.065em] text-balance">Coaching that <span className="text-[#77ff61]">lands.</span></motion.h1>
            <motion.p {...rise(.14)} className="mt-7 max-w-xl text-base leading-7 font-light text-[#b9ccaf] sm:text-xl sm:leading-8">Give every group a calm, focused feed for announcements, live polls, resources, and the updates that matter.</motion.p>
            <motion.div {...rise(.22)} className="mt-9 flex flex-col gap-3 sm:flex-row"><Button size="lg" className="h-12 bg-[#77ff61] px-6 text-base text-[#013a00] shadow-[0_10px_32px_rgba(119,255,97,.2)] hover:bg-[#8dff79]" asChild><Link href="/join">Join with an invite code <ArrowRight className="size-4" /></Link></Button><Button size="lg" variant="outline" className="h-12 border-white/12 bg-white/[.035] px-6 text-base text-[#dee4dd] backdrop-blur-xl hover:border-[#77ff61]/35 hover:bg-white/[.07] hover:text-[#77ff61]" asChild><Link href="/login">Coach sign in</Link></Button></motion.div>
            <motion.div {...rise(.3)} className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-sm text-[#84967c]">{["Invite-only access", "30-day sessions", "Full audit history"].map((item) => <span key={item} className="flex items-center gap-2"><Check className="size-3.5 text-[#77ff61]" />{item}</span>)}</motion.div>
          </div>

          <motion.div {...rise(.16)} className="relative mx-auto w-full max-w-xl lg:mx-0">
            <div className="absolute -inset-8 rounded-full bg-[#77ff61]/[.07] blur-3xl" />
            <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[.04] p-3 shadow-[0_34px_100px_rgba(0,0,0,.5)] backdrop-blur-2xl sm:p-5">
              <div className="flex items-center justify-between border-b border-white/8 px-2 pb-4"><div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-full bg-[#77ff61]/10 text-[#77ff61]"><Users className="size-4.5" /></span><div><p className="text-sm font-medium">AI Workshop</p><p className="text-xs text-[#84967c]">24 trainees</p></div></div><span className="flex items-center gap-1.5 rounded-full border border-[#77ff61]/15 bg-[#77ff61]/[.06] px-2.5 py-1 text-[11px] text-[#77ff61]"><Radio className="size-3" /> Live</span></div>
              <div className="space-y-3 py-5"><StreamCard icon={Pin} label="Pinned by Coach Mira" time="09:42" title="Tomorrow’s workshop starts at 10 AM" text="Bring your campaign brief—we’ll turn it into a working prompt system." accent /><StreamCard icon={MessageSquareText} label="Multiple-choice poll" time="10:05" title="What should we practise next?" text="Prompt strategy  ·  AI agents  ·  Automation" /><div className="ml-auto flex w-[82%] items-center gap-3 rounded-2xl border border-white/8 bg-[#0a0f0c]/55 p-3.5"><span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#77ff61] text-[#013a00]"><Check className="size-4" /></span><div><p className="text-xs font-medium">Delivered to the whole group</p><p className="mt-0.5 text-[11px] text-[#84967c]">Read-only. Clear. No noise.</p></div></div></div>
              <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[.025] p-3 text-sm text-[#84967c]"><span className="flex size-9 items-center justify-center rounded-full border border-white/8"><MessagesSquare className="size-4" /></span>Write an announcement…</div>
            </div>
          </motion.div>
        </section>

        <section className="border-y border-white/[.07] bg-white/[.018] px-5 py-20 backdrop-blur-xl"><div className="mx-auto max-w-7xl"><div className="max-w-2xl"><p className="text-xs font-medium tracking-[.16em] text-[#77ff61] uppercase">Built around attention</p><h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">Everything a group needs. Nothing it doesn’t.</h2></div><div className="mt-12 grid gap-4 md:grid-cols-3"><Feature icon={Users} title="Invite-only groups" description="Regeneratable codes keep membership intentional and make onboarding instant." /><Feature icon={Pin} title="Updates stay visible" description="Pin the essential message so nobody has to search through a noisy timeline." /><Feature icon={ShieldCheck} title="Accountable by design" description="Every edit and deletion stays traceable, with clear role-based control." /></div></div></section>

        <section className="px-5 py-24"><div className="mx-auto max-w-7xl rounded-[2rem] border border-[#77ff61]/15 bg-[linear-gradient(135deg,rgba(119,255,97,.1),rgba(255,255,255,.025))] p-7 backdrop-blur-2xl sm:p-12 lg:flex lg:items-end lg:justify-between"><div className="max-w-2xl"><p className="text-sm text-[#77ff61]">Ready when your group is.</p><h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">Turn the next update into shared momentum.</h2></div><Button size="lg" className="mt-8 h-12 bg-[#77ff61] px-6 text-[#013a00] shadow-[0_10px_32px_rgba(119,255,97,.2)] hover:bg-[#8dff79] lg:mt-0" asChild><Link href="/join">Join a group <ArrowRight className="size-4" /></Link></Button></div></section>
      </main>
    </div>
  );
}

function StreamCard({ icon: Icon, label, time, title, text, accent = false }: { icon: typeof Pin; label: string; time: string; title: string; text: string; accent?: boolean }) {
  return <div className={`w-[92%] rounded-2xl border p-4 ${accent ? "border-[#77ff61]/20 bg-[#77ff61]/[.065]" : "border-white/8 bg-white/[.035]"}`}><div className="flex items-center justify-between text-[11px] text-[#84967c]"><span className="flex items-center gap-1.5"><Icon className={`size-3.5 ${accent ? "text-[#77ff61]" : ""}`} />{label}</span><span>{time}</span></div><p className="mt-3 text-sm font-medium text-[#dee4dd] sm:text-base">{title}</p><p className="mt-1.5 text-xs leading-5 text-[#b9ccaf] sm:text-sm">{text}</p></div>;
}

function Feature({ icon: Icon, title, description }: { icon: typeof Users; title: string; description: string }) {
  return <motion.article whileHover={{ y: -4 }} transition={{ duration: .25 }} className="rounded-[1.7rem] border border-white/9 bg-white/[.032] p-6 shadow-[0_18px_50px_rgba(0,0,0,.18)] backdrop-blur-2xl"><span className="flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-[#77ff61]"><Icon className="size-5" /></span><h3 className="mt-6 text-lg font-medium">{title}</h3><p className="mt-2 text-sm leading-6 text-[#b9ccaf]">{description}</p></motion.article>;
}
