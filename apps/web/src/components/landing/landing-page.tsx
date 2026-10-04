"use client";

import * as React from "react";
import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import { PageMotion } from "@/components/layout/page-motion";
import { ParticipantEntryForm } from "@/components/auth/participant-entry-form";

export function LandingPage() {
  return (
    <div className="relative h-svh w-full overflow-hidden text-foreground">
      <div className="pointer-events-none fixed -top-40 -right-32 size-[38rem] rounded-full bg-primary/20 blur-3xl -z-10" />
      <div className="pointer-events-none fixed -bottom-44 -left-36 size-[34rem] rounded-full bg-blue-300/40 blur-3xl -z-10" />
      <div className="relative z-10 grid h-full w-full md:grid-cols-2 lg:grid-cols-[1fr_1.05fr]">
        <section className="flex h-full flex-col justify-between p-6 sm:p-10 lg:p-14 overflow-y-auto md:overflow-hidden">
          <div>
            <Link href="/" className="inline-flex items-center gap-3 font-semibold tracking-wide text-lg sm:text-xl">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[0_10px_28px_rgba(37,99,235,.22)]">
                <MessagesSquare className="size-4" />
              </span>
              AI Empowerment
            </Link>
          </div>
          <div className="flex flex-1 items-center justify-center py-6">
            <div className="glass w-full max-w-md rounded-[2rem] p-6 sm:p-8 shadow-xl">
              <PageMotion>
                <React.Suspense fallback={null}>
                  <ParticipantEntryForm />
                </React.Suspense>
              </PageMotion>
            </div>
          </div>
          <div className="hidden md:block" />
        </section>
        <aside className="relative hidden md:flex flex-col justify-end h-full overflow-hidden bg-primary p-10 md:p-12 lg:p-16 text-primary-foreground">
          <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_center,white_1px,transparent_1px)] [background-size:40px_40px]" />
          <div className="relative max-w-xl">
            <p className="text-sm font-semibold tracking-[.16em] uppercase text-primary-foreground/90">Participant Portal</p>
            <h2 className="mt-5 text-3xl sm:text-4xl lg:text-4xl font-bold tracking-tight leading-tight">
              Interactive learning and real-time collaboration.
            </h2>
            <p className="mt-5 text-base sm:text-lg text-primary-foreground/80 font-normal leading-relaxed">
              Connect directly with your mentors, coaches, and peer learning community in real time.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
