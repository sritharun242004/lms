"use client";

import * as React from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Check, MessagesSquare, Radio, ShieldCheck } from "lucide-react";
import { ParticipantEntryForm } from "@/components/auth/participant-entry-form";

const ease = [0.16, 1, 0.3, 1] as const;

export function LandingPage() {
  const reduceMotion = useReducedMotion();
  const reveal = (delay = 0) => ({
    initial: reduceMotion ? false : { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.62, delay, ease },
  });

  return (
    <main className="min-h-svh bg-[#202020] p-1.5 font-sans text-white sm:p-2">
      <div className="grid min-h-[calc(100svh-0.75rem)] overflow-hidden rounded-[1.15rem] border border-white/15 bg-[#07090d] shadow-[0_24px_80px_rgba(15,23,42,.28)] sm:min-h-[calc(100svh-1rem)] lg:grid-cols-2">
        <section className="relative flex min-h-[42rem] flex-col overflow-hidden px-5 py-6 sm:px-10 sm:py-9 lg:min-h-0 lg:px-[clamp(2.5rem,5vw,6rem)] lg:py-12">
          <div className="pointer-events-none absolute -top-44 -left-44 size-[28rem] rounded-full bg-primary/10 blur-3xl" />
          <div className="pointer-events-none absolute inset-0 opacity-[.035] [background-image:radial-gradient(circle_at_center,white_1px,transparent_1px)] [background-size:30px_30px]" />

          <motion.header {...reveal()} className="relative z-10">
            <Link href="/" className="inline-flex items-center gap-3 text-lg font-bold tracking-[-.02em] sm:text-xl">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[0_12px_30px_rgba(37,99,235,.3)]">
                <MessagesSquare className="size-[1.15rem]" />
              </span>
              AI Empowerment
            </Link>
          </motion.header>

          <div className="relative z-10 mx-auto flex w-full max-w-lg flex-1 items-center py-14 sm:py-20 lg:py-12">
            <motion.div {...reveal(.08)} className="w-full">
              <React.Suspense fallback={null}>
                <ParticipantEntryForm />
              </React.Suspense>
            </motion.div>
          </div>

          <motion.p {...reveal(.18)} className="relative z-10 text-center text-xs leading-5 text-slate-500 lg:text-left">
            Private, invite-only access for every group.
          </motion.p>
        </section>

        <section className="relative isolate flex min-h-[30rem] items-end overflow-hidden bg-primary px-6 py-10 text-primary-foreground sm:min-h-[36rem] sm:px-12 sm:py-14 lg:min-h-0 lg:px-[clamp(3rem,6vw,7rem)] lg:py-[clamp(3.5rem,7vw,7rem)]">
          <div className="pointer-events-none absolute inset-0 opacity-[.17] [background-image:radial-gradient(circle_at_center,white_1px,transparent_1px)] [background-size:40px_40px]" />
          <div className="pointer-events-none absolute -top-28 -right-32 size-[32rem] rounded-full border border-white/15" />
          <div className="pointer-events-none absolute -top-12 -right-10 size-[22rem] rounded-full border border-white/15" />
          <div className="pointer-events-none absolute top-[18%] left-[10%] size-28 rounded-full bg-white/10 blur-3xl" />

          <motion.div {...reveal(.14)} className="relative z-10 max-w-xl">
            <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-semibold backdrop-blur-sm">
              <Radio className="size-3.5" /> One focused space for every group
            </span>
            <h1 className="max-w-lg text-[clamp(2.6rem,5vw,5.4rem)] leading-[.94] font-bold tracking-[-.055em] text-balance">
              Keep every participant in the loop.
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-blue-100 sm:text-xl sm:leading-8">
              Announcements, live chat, polls, shared media, and invite-only communities—built for modern coaching programs.
            </p>

            <div className="mt-8 grid gap-3 text-sm text-blue-50 sm:grid-cols-2">
              <span className="flex items-center gap-2"><Check className="size-4" /> Join with one code</span>
              <span className="flex items-center gap-2"><ShieldCheck className="size-4" /> Access stays private</span>
            </div>

            <Link href="/login" className="group mt-10 inline-flex items-center gap-2 text-sm font-semibold underline decoration-white/40 underline-offset-4 transition hover:decoration-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
              Coach or staff sign in <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </motion.div>
        </section>
      </div>
    </main>
  );
}
