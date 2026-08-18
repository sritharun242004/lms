"use client";

import * as React from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { MessagesSquare } from "lucide-react";
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
      <div className="min-h-[calc(100svh-0.75rem)] overflow-hidden rounded-[1.15rem] border border-white/15 bg-[#07090d] shadow-[0_24px_80px_rgba(15,23,42,.28)] sm:min-h-[calc(100svh-1rem)]">
        <section className="relative mx-auto flex min-h-[calc(100svh-0.75rem)] max-w-3xl flex-col overflow-hidden px-5 py-6 sm:min-h-[calc(100svh-1rem)] sm:px-10 sm:py-9 lg:px-16 lg:py-12">
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

          <div className="relative z-10 mx-auto flex w-full max-w-lg flex-1 items-center py-14 sm:py-20">
            <motion.div {...reveal(.08)} className="w-full">
              <React.Suspense fallback={null}>
                <ParticipantEntryForm />
              </React.Suspense>
            </motion.div>
          </div>

          <motion.p {...reveal(.18)} className="relative z-10 text-center text-xs leading-5 text-slate-500">
            Private, invite-only access for every group.
          </motion.p>
        </section>

      </div>
    </main>
  );
}
