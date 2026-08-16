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
    <div className="relative min-h-svh overflow-hidden text-foreground">
      <div className="ambient-orb -top-48 -right-40 size-[42rem] bg-primary/25" />
      <div className="ambient-orb top-[42rem] -left-44 size-[36rem] bg-brand-200/70 [animation-delay:-8s]" />

      <header className="sticky top-0 z-50 px-3 pt-3 sm:px-6 sm:pt-5">
        <div className="glass mx-auto flex h-16 max-w-7xl items-center justify-between rounded-[1.35rem] px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-3 font-bold tracking-tight"><span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[0_10px_28px_rgba(71,102,75,.22)]"><MessagesSquare className="size-4.5" /></span><span>AI Empowerment</span></Link>
          <div className="flex items-center gap-1.5 sm:gap-3"><Button variant="ghost" className="hidden sm:inline-flex" asChild><Link href="/login">Coach sign in</Link></Button><Button asChild><Link href="/join">Join a group <ArrowRight className="size-4" /></Link></Button></div>
        </div>
      </header>

      <main className="relative z-10">
        <section className="mx-auto grid min-h-[calc(100svh-92px)] max-w-7xl items-center gap-14 px-5 py-16 lg:grid-cols-[1.03fr_.97fr] lg:px-8 lg:py-20">
          <div className="max-w-3xl">
            <motion.div {...rise()} className="mb-7 inline-flex items-center gap-2 rounded-xl bg-primary/8 px-3.5 py-2 text-xs font-semibold tracking-[.12em] text-primary uppercase"><Sparkles className="size-3.5" /> One channel. Everyone aligned.</motion.div>
            <motion.h1 {...rise(.06)} className="text-[clamp(3.2rem,7vw,6.9rem)] leading-[.91] font-bold tracking-[-.065em] text-balance">Coaching that <span className="text-primary">lands.</span></motion.h1>
            <motion.p {...rise(.14)} className="mt-7 max-w-xl text-base leading-7 text-muted-foreground sm:text-xl sm:leading-8">Give every group a calm, focused feed for announcements, live polls, resources, and the updates that matter.</motion.p>
            <motion.div {...rise(.22)} className="mt-9 flex flex-col gap-3 sm:flex-row"><Button size="lg" asChild><Link href="/join">Join with an invite code <ArrowRight className="size-4" /></Link></Button><Button size="lg" variant="outline" asChild><Link href="/login">Coach sign in</Link></Button></motion.div>
            <motion.div {...rise(.3)} className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-sm text-muted-foreground">{["Invite-only access", "30-day sessions", "Full audit history"].map((item) => <span key={item} className="flex items-center gap-2"><Check className="size-3.5 text-primary" />{item}</span>)}</motion.div>
          </div>

          <motion.div {...rise(.16)} className="relative mx-auto w-full max-w-xl lg:mx-0">
            <div className="absolute -inset-10 rounded-full bg-primary/12 blur-3xl" />
            <div className="glass relative overflow-hidden rounded-[2rem] p-4 sm:p-6">
              <div className="flex items-center justify-between border-b border-border/60 pb-4"><div className="flex items-center gap-3"><span className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Users className="size-4.5" /></span><div><p className="text-sm font-semibold">AI Workshop</p><p className="text-xs text-muted-foreground">24 trainees</p></div></div><span className="flex items-center gap-1.5 rounded-lg bg-primary/8 px-2.5 py-1 text-[11px] font-semibold text-primary"><Radio className="size-3" /> Live</span></div>
              <div className="space-y-3 py-5"><StreamCard icon={Pin} label="Pinned by Coach Mira" time="09:42" title="Tomorrow’s workshop starts at 10 AM" text="Bring your campaign brief—we’ll turn it into a working prompt system." accent /><StreamCard icon={MessageSquareText} label="Multiple-choice poll" time="10:05" title="What should we practise next?" text="Prompt strategy  ·  AI agents  ·  Automation" /><div className="ml-auto flex w-[82%] items-center gap-3 rounded-2xl bg-white/75 p-3.5 shadow-sm dark:bg-white/5"><span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Check className="size-4" /></span><div><p className="text-xs font-semibold">Delivered to the whole group</p><p className="mt-0.5 text-[11px] text-muted-foreground">Read-only. Clear. No noise.</p></div></div></div>
              <div className="flex items-center gap-3 rounded-2xl bg-input p-3 text-sm text-muted-foreground"><span className="flex size-9 items-center justify-center rounded-xl bg-white/70 shadow-sm dark:bg-white/5"><MessagesSquare className="size-4" /></span>Write an announcement…</div>
            </div>
          </motion.div>
        </section>

        <section className="border-y border-white/60 bg-white/22 px-5 py-20 backdrop-blur-xl dark:border-white/10 dark:bg-white/[.025]"><div className="mx-auto max-w-7xl"><div className="max-w-2xl"><p className="text-xs font-semibold tracking-[.16em] text-primary uppercase">Built around attention</p><h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">Everything a group needs. Nothing it doesn’t.</h2></div><div className="mt-12 grid gap-5 md:grid-cols-3"><Feature icon={Users} title="Invite-only groups" description="Regeneratable codes keep membership intentional and make onboarding instant." /><Feature icon={Pin} title="Updates stay visible" description="Pin the essential message so nobody has to search through a noisy timeline." /><Feature icon={ShieldCheck} title="Accountable by design" description="Every edit and deletion stays traceable, with clear role-based control." /></div></div></section>

        <section className="px-5 py-24"><div className="glass mx-auto max-w-7xl rounded-[2rem] p-7 sm:p-12 lg:flex lg:items-end lg:justify-between"><div className="max-w-2xl"><p className="text-sm font-semibold text-primary">Ready when your group is.</p><h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">Turn the next update into shared momentum.</h2></div><Button size="lg" className="mt-8 lg:mt-0" asChild><Link href="/join">Join a group <ArrowRight className="size-4" /></Link></Button></div></section>
      </main>
    </div>
  );
}

function StreamCard({ icon: Icon, label, time, title, text, accent = false }: { icon: typeof Pin; label: string; time: string; title: string; text: string; accent?: boolean }) {
  return <div className={`w-[92%] rounded-2xl p-4 ${accent ? "bg-brand-100/70 dark:bg-primary/10" : "bg-white/65 shadow-sm dark:bg-white/5"}`}><div className="flex items-center justify-between text-[11px] text-muted-foreground"><span className="flex items-center gap-1.5"><Icon className={`size-3.5 ${accent ? "text-primary" : ""}`} />{label}</span><span>{time}</span></div><p className="mt-3 text-sm font-semibold sm:text-base">{title}</p><p className="mt-1.5 text-xs leading-5 text-muted-foreground sm:text-sm">{text}</p></div>;
}

function Feature({ icon: Icon, title, description }: { icon: typeof Users; title: string; description: string }) {
  return <motion.article whileHover={{ y: -4 }} transition={{ duration: .25 }} className="glass rounded-[1.7rem] p-6"><span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Icon className="size-5" /></span><h3 className="mt-6 text-lg font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p></motion.article>;
}
