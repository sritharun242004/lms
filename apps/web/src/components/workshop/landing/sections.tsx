"use client";

import * as React from "react";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { Button } from "@/components/ui/button";

// Scroll-triggered fade/rise for a section's parts, skipped entirely
// for a visitor who has asked for reduced motion.
function Reveal({
  children,
  className,
  delay = 0,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  style?: React.CSSProperties;
}) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return <div className={className} style={style}>{children}</div>;

  const variants: Variants = {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] } },
  };

  return (
    <motion.div
      className={className}
      style={style}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-8% 0px -8% 0px" }}
      variants={variants}
    >
      {children}
    </motion.div>
  );
}

function SectionHeading({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={`font-extrabold tracking-[-0.03em] leading-[1.05] text-slate-900 ${className}`}>
      {children}
    </h2>
  );
}

const NAV_LINKS = [
  { href: "#curriculum", label: "Curriculum" },
  { href: "#trainers", label: "Trainers" },
  { href: "#fees", label: "Fees" },
  { href: "#faq", label: "FAQ" },
];

export function WorkshopNav() {
  return (
    <header className="sticky top-4 z-50 w-full px-4 sm:px-6">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between rounded-full border border-slate-200/80 bg-white/80 px-6 backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <a href="#" className="text-base font-extrabold tracking-tight text-slate-900 hover:opacity-90 transition-opacity">
          X Intelligence
        </a>
        <nav className="hidden items-center gap-7 text-sm font-semibold text-slate-600 sm:flex">
          {NAV_LINKS.map((link) => (
            <a key={link.label} href={link.href} className="transition-colors hover:text-primary">
              {link.label}
            </a>
          ))}
        </nav>
        <Button asChild size="sm" className="rounded-full px-5 shadow-sm">
          <a href="#register">Register</a>
        </Button>
      </div>
    </header>
  );
}

// Hero — white background with glassmorphic depth, perfectly aligned typography,
// and a fully-visible, animated brand display.
export function Hero() {
  return (
    <section className="relative overflow-hidden bg-white pt-10 pb-16 sm:pt-16 sm:pb-24">
      <div className="mx-auto max-w-5xl px-5 sm:px-7">
        <div className="relative z-10 max-w-3xl">
          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="text-xs font-bold uppercase tracking-[0.2em] text-primary"
          >
            Friends &amp; Family Edition · Chennai
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl md:text-5xl lg:text-6xl leading-[1.12]"
          >
            A hands-on, 2-day AI empowerment workshop for professionals and business leaders.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="mt-5 max-w-2xl text-base sm:text-xl font-normal leading-relaxed text-slate-600"
          >
            You learn by doing, on your own work, with your own laptop.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="mt-8"
          >
            <Button asChild size="lg" className="rounded-full px-8 text-base font-semibold shadow-md hover:shadow-lg transition-all">
              <a href="#register">Reserve my seat</a>
            </Button>
          </motion.div>
        </div>

        {/* Fully visible enlarged brand word with smooth load animation */}
        <motion.div
          aria-hidden="true"
          initial={{ opacity: 0, y: 35, letterSpacing: "0.04em" }}
          animate={{ opacity: 1, y: 0, letterSpacing: "-0.04em" }}
          transition={{ duration: 1.1, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="pointer-events-none mt-12 sm:mt-16 select-none overflow-hidden"
        >
          <p className="w-full text-center sm:text-left text-[clamp(2.75rem,10.2vw,8.75rem)] font-extrabold leading-none tracking-[-0.04em] text-primary/15">
            INTELLIGENCE
          </p>
        </motion.div>
      </div>
    </section>
  );
}

// WhyNow — The numbers are already in (4 glassmorphic research clipping cards + synthesis)
export function WhyNow() {
  const stats = [
    {
      big: "92%",
      line: "of knowledge workers in India already use AI at work. The global figure is 75%.",
      source: "Microsoft & LinkedIn Work Trend Index, 2024",
    },
    {
      big: "54%",
      line: "of Indian leaders worry their company has no plan for AI.",
      source: "Microsoft & LinkedIn Work Trend Index, 2024",
    },
    {
      big: "25% / 40%",
      line: "faster and higher-quality work from BCG consultants using GPT-4.",
      source: "Harvard Business School & BCG study, 2023",
    },
    {
      big: "+34%",
      line: "productivity gain for newer, less experienced staff using an AI assistant.",
      source: "Stanford & MIT, NBER, 2023",
    },
  ];

  return (
    <section className="bg-white px-5 py-24 sm:px-7 border-t border-slate-100">
      <div className="mx-auto flex max-w-5xl flex-col">
        <Reveal>
          <SectionHeading className="text-[clamp(1.5rem,3.2vw,2.75rem)]">
            The numbers are already in.
          </SectionHeading>
          <p className="mt-4 max-w-2xl text-base text-slate-600 leading-relaxed">
            AI adoption is already here. Leading research shows the widening gap between casual tool use and actual operational advantage:
          </p>
        </Reveal>

        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat, index) => (
            <Reveal key={stat.big} delay={index * 0.08}>
              <div className="flex h-full flex-col justify-between rounded-2xl border border-slate-200/80 bg-white/70 p-6 backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] hover:border-primary/40 transition-all">
                <div>
                  <p className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
                    {stat.big}
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-slate-600">
                    {stat.line}
                  </p>
                </div>
                <div className="mt-6 border-t border-slate-100 pt-3">
                  <p className="text-xs text-slate-400 font-medium">{stat.source}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.2} className="mt-12">
          <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-6 backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
            <p className="text-base sm:text-lg font-semibold text-slate-900">
              Everyone has the tools. Very few know how to use them well. That gap is what these two days close.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// about — "Who we are", leadership mindset focus in a clean glassmorphic container
export function About() {
  const facts = [
    { label: "Lead trainer", value: "~50 organisations trained" },
    { label: "Format", value: "2 days, hands-on" },
    { label: "Edition", value: "Friends & family" },
  ];
  return (
    <section className="bg-white px-5 py-24 sm:px-7 border-t border-slate-100">
      <div className="mx-auto grid max-w-5xl gap-12 rounded-3xl border border-slate-200/80 bg-white/70 p-8 sm:p-12 backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.03)] lg:grid-cols-[220px_1fr]">
        <Reveal className="flex flex-col gap-6">
          {facts.map((fact) => (
            <div key={fact.label}>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{fact.label}</p>
              <p className="mt-1 text-sm font-bold text-slate-900">{fact.value}</p>
            </div>
          ))}
        </Reveal>
        <div>
          <Reveal>
            <p className="text-xs font-bold uppercase tracking-wider text-primary mb-3">X Intelligence</p>
            <p className="text-[clamp(1.5rem,2.3vw,1.875rem)] font-bold leading-snug text-slate-900">
              We run AI empowerment programs for founders, CXOs and senior leaders. Our focus is the
              AI mindset, not just the tools. Tools change every month. The way you think and work
              with them is what lasts.
            </p>
            <p className="mt-6 text-sm text-slate-600 leading-relaxed">
              This edition is a small, specially priced round for friends and family. It runs on the
              same content as our corporate program, adjusted for your kind of work.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// how-it-works — 3 progressive stages in glassmorphic cards on white background
export function Journey() {
  const stops = [
    { track: "Day 1 · Track 1", line: "First, you become fluent yourself.", detail: "Day 1: prompting, assistants, analytics, imaging, bots and agents." },
    { track: "Day 2 · Track 2", line: "Then your team builds with Claude.", detail: "Day 2: real work, your own data, workflows and vibe coding." },
    { track: "Next Steps · Scale", line: "Keep going after the workshop.", detail: "Ask us about our 10-week coaching program." },
  ];
  return (
    <section id="journey" className="bg-white px-5 py-24 sm:px-7 border-t border-slate-100">
      <div className="mx-auto max-w-5xl">
        <Reveal>
          <SectionHeading className="text-[clamp(1.5rem,2.6vw,2.25rem)]">From you, to your team.</SectionHeading>
          <p className="mt-3 text-sm text-slate-500 font-medium">
            Day 2 is open only to people who have done Day 1 before, either earlier or on Day 1 of this edition.
          </p>
        </Reveal>
        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {stops.map((stop, index) => (
            <Reveal
              key={stop.line}
              delay={index * 0.1}
              className="flex h-full flex-col justify-between rounded-2xl border border-slate-200/80 bg-white/70 p-8 backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] hover:border-primary/40 transition-all"
            >
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-primary">
                  {stop.track}
                </span>
                <p className="mt-4 text-xl font-extrabold leading-snug text-slate-900">
                  {stop.line}
                </p>
                <p className="mt-3 text-sm text-slate-600 leading-relaxed">{stop.detail}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// showcase — Day 1 and Day 2 compared
export function Outcomes() {
  return (
    <section className="bg-white px-5 py-24 sm:px-7 border-t border-slate-100">
      <div className="mx-auto max-w-5xl">
        <div className="grid gap-8 sm:grid-cols-2">
          <Reveal>
            <div className="h-full rounded-2xl border border-slate-200/80 bg-white/70 p-8 backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Track 1</span>
              <p className="mt-2 text-4xl font-extrabold text-slate-900">Day 1</p>
              <p className="mt-3 text-lg font-semibold text-slate-600">
                AI Empowerment for Professionals
              </p>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="h-full rounded-2xl border border-primary/30 bg-white/80 p-8 backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.03)] ring-1 ring-primary/20">
              <span className="text-xs font-bold uppercase tracking-wider text-primary">Track 2</span>
              <p className="mt-2 text-4xl font-extrabold text-primary">Day 2</p>
              <p className="mt-3 text-lg font-semibold text-slate-600">
                AI Empowerment for Business Leaders 2.0
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// features — "What we cover": cleanly justified, aligned numbered module list in glassmorphic cards
export function Curriculum() {
  const day1 = [
    ["AI for everyday productivity", "the tools that save you real hours every week"],
    ["Smart prompting", "how to ask so you get usable answers the first time"],
    ["Your own AI assistants", "build and customise assistants for your work"],
    ["Beyond chat", "analytics, imaging, bots and agentic AI, shown through real use cases"],
  ];
  const day2 = [
    ["Quick recap", "of Day 1"],
    ["Claude, hands-on", "using it for real day-to-day work"],
    ["AI analytics", "on your kind of data"],
    ["AI-enabled workflows", "set them up once and they run with very little effort"],
    ["Vibe coding", "build simple apps and interfaces without writing code yourself"],
    ["Advanced imaging", "professional-quality visuals, concepts and techniques"],
  ];

  return (
    <section id="curriculum" className="bg-white px-5 py-24 sm:px-7 border-t border-slate-100">
      <div className="mx-auto max-w-5xl">
        <Reveal>
          <SectionHeading className="text-[clamp(1.5rem,2.6vw,2.25rem)]">What we cover</SectionHeading>
        </Reveal>

        <div className="mt-12 grid gap-8 lg:grid-cols-2">
          {/* Day 1 Card */}
          <Reveal>
            <div className="h-full rounded-3xl border border-slate-200/80 bg-white/75 p-8 sm:p-10 backdrop-blur-md shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
              <span className="text-xs font-bold uppercase tracking-wider text-primary">Track 1</span>
              <p className="mt-2 text-xl font-bold text-slate-900">Day 1: AI Empowerment for Professionals</p>
              <p className="mt-1 text-sm text-slate-500">
                From the fundamentals all the way up to agentic AI.
              </p>

              <ol className="mt-8 flex flex-col divide-y divide-slate-100">
                {day1.map(([title, body], idx) => (
                  <li key={title} className="flex items-start gap-4 py-4 first:pt-0 last:pb-0">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                      0{idx + 1}
                    </span>
                    <div className="flex-1">
                      <p className="text-base font-bold text-slate-900">{title}</p>
                      <p className="mt-1 text-sm text-slate-600 leading-relaxed">{body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </Reveal>

          {/* Day 2 Card */}
          <Reveal delay={0.08}>
            <div className="h-full rounded-3xl border border-slate-200/80 bg-white/75 p-8 sm:p-10 backdrop-blur-md shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
              <span className="text-xs font-bold uppercase tracking-wider text-primary">Track 2</span>
              <p className="mt-2 text-xl font-bold text-slate-900">Day 2: AI Empowerment for Business Leaders 2.0</p>
              <p className="mt-1 text-sm text-slate-500">For Day 1 graduates. More hands-on, more depth.</p>

              <ol className="mt-8 flex flex-col divide-y divide-slate-100">
                {day2.map(([title, body], idx) => (
                  <li key={title} className="flex items-start gap-4 py-4 first:pt-0 last:pb-0">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                      0{idx + 1}
                    </span>
                    <div className="flex-1">
                      <p className="text-base font-bold text-slate-900">{title}</p>
                      <p className="mt-1 text-sm text-slate-600 leading-relaxed">{body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// list (table) — daily schedule in a glassmorphic card
export function DailySchedule() {
  const items = [
    { time: "8:45 am", label: "Reporting & check-in", note: "Welcome coffee & laptop setup" },
    { time: "9:15 am", label: "We start: Learn, Try, Build, repeating each module", note: "Hands-on implementation on your own laptop" },
    { time: "1:00 pm", label: "Lunch & refreshments (included)", note: "Networking and group discussion" },
    { time: "5:30 pm", label: "Wrap-up", note: "Action plan & next steps review" },
  ];
  return (
    <section className="bg-white px-5 py-24 sm:px-7 border-t border-slate-100">
      <div className="mx-auto max-w-5xl">
        <Reveal>
          <SectionHeading className="text-[clamp(1.5rem,2.6vw,2.25rem)]">A full day, mostly hands-on</SectionHeading>
        </Reveal>
        <div className="mt-12 rounded-3xl border border-slate-200/80 bg-white/70 p-8 sm:p-10 backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
          <div className="flex flex-col divide-y divide-slate-100">
            {items.map((item, index) => (
              <Reveal key={index} delay={index * 0.05} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-4 first:pt-0 last:pb-0">
                <div className="flex items-center gap-4">
                  <span className="flex h-8 w-20 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary tabular-nums">
                    {item.time}
                  </span>
                  <div>
                    <span className="text-base font-bold text-slate-900">{item.label}</span>
                    <p className="text-xs text-slate-500">{item.note}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
        <p className="mt-8 text-base font-semibold text-slate-700">
          Bring real work. That&apos;s where the learning sticks.
        </p>
      </div>
    </section>
  );
}

// list (two-ended rows) — outcomes in glassmorphic cards
export function DailyOutcomes() {
  const items = [
    { text: "A custom AI assistant built for a task you do every week", day: "Day 1" },
    { text: "A prompt approach you can reuse for any task", day: "Day 1" },
    { text: "Hands-on time with images, analytics and agents", day: "Day 1" },
    { text: "A dashboard or analysis made from your own kind of data", day: "Day 2" },
    { text: "A working automated workflow", day: "Day 2" },
    { text: "A simple app or interface you built yourself", day: "Day 2" },
  ];
  return (
    <section className="bg-white px-5 py-24 sm:px-7 border-t border-slate-100">
      <div className="mx-auto max-w-5xl">
        <Reveal>
          <SectionHeading className="text-[clamp(1.5rem,2.6vw,2.25rem)]">
            You don&apos;t just watch. You build.
          </SectionHeading>
        </Reveal>
        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {items.map((item, index) => (
            <Reveal key={index} delay={index * 0.04}>
              <div className="flex h-full items-start justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white/70 p-6 backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
                <span className="text-sm font-semibold text-slate-900">{item.text}</span>
                <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">{item.day}</span>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// proof — who's teaching in glassmorphic cards
export function Trainers() {
  const trainers = [
    { name: "Mehul Nanavati", role: "Lead Trainer", org: "Formerly Managing Director, Raj Petro Specialities", bio: "Decades of experience running a large enterprise. He has trained around 50 organisations in AI empowerment." },
    { name: "Philip Moses", role: "Trainer", org: "Founder & CEO, Belsterns Technologies", bio: "Leads the hands-on sessions on analytics, workflows and building with AI." },
    { name: "Madhan Raj", role: "Trainer", org: "Founder & CEO, The Bot Company", bio: "Leads the sessions on advanced imaging and building apps with AI." },
  ];
  return (
    <section id="trainers" className="bg-white px-5 py-24 sm:px-7 border-t border-slate-100">
      <div className="mx-auto max-w-5xl">
        <Reveal>
          <SectionHeading className="text-[clamp(1.5rem,2.6vw,2.25rem)]">Who&apos;s teaching</SectionHeading>
        </Reveal>
        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {trainers.map((trainer, index) => (
            <Reveal
              key={trainer.name}
              delay={index * 0.06}
              className="flex h-full flex-col justify-between rounded-2xl border border-slate-200/80 bg-white/70 p-8 backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] hover:border-primary/40 transition-all"
            >
              <div>
                <p className="text-xl font-bold text-slate-900">{trainer.name}</p>
                <p className="mt-1 text-xs font-bold uppercase tracking-wider text-primary">{trainer.role}</p>
                <p className="mt-2 text-xs font-semibold text-slate-500">{trainer.org}</p>
                <p className="mt-4 text-sm leading-relaxed text-slate-600">{trainer.bio}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// pricing — three real packages on white background with glassmorphic cards
export function Pricing() {
  const packages = [
    { label: "Day 1 only", usd: "USD 252", inr: "₹28,250", note: "₹23,940 + 18% GST", popular: false },
    { label: "Day 1 + Day 2", usd: "USD 495 — save USD 36", inr: "₹55,490", note: "₹47,025 + 18% GST", popular: true },
    { label: "Day 2 only", usd: "USD 279", inr: "₹31,275", note: "₹26,505 + 18% GST", popular: false },
  ];
  const requirements = [
    { item: "Laptop (no iPads)", need: "Both days" },
    { item: "ChatGPT Business or Claude Pro", need: "Day 1, at least one" },
    { item: "Claude Pro and ChatGPT Business", need: "Day 2, both" },
    { item: "Microsoft Copilot Studio", need: "Good to have on Day 2" },
  ];
  return (
    <section id="fees" className="bg-white px-5 py-24 sm:px-7 border-t border-slate-100">
      <div className="mx-auto w-full max-w-5xl">
        <Reveal>
          <SectionHeading className="text-[clamp(1.75rem,3.4vw,2.75rem)]">Fees</SectionHeading>
        </Reveal>

        <Reveal delay={0.08} className="mt-12 flex flex-col gap-4">
          {packages.map((pkg) => (
            <div
              key={pkg.label}
              className={`grid grid-cols-1 gap-2 rounded-2xl border p-6 backdrop-blur-md transition-all sm:grid-cols-[180px_1fr_1.2fr_auto] sm:items-baseline sm:gap-6 ${
                pkg.popular
                  ? "border-primary/40 bg-white/90 shadow-[0_8px_30px_rgba(37,99,235,0.08)] ring-1 ring-primary/30"
                  : "border-slate-200/80 bg-white/70 shadow-[0_4px_20px_rgba(0,0,0,0.03)]"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-slate-900">{pkg.label}</span>
                {pkg.popular && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                    Best value
                  </span>
                )}
              </div>
              <span className="text-sm text-slate-500 font-medium">{pkg.note}</span>
              <span className="text-sm font-semibold text-primary">{pkg.usd}</span>
              <span className="text-2xl font-extrabold text-slate-900 sm:text-right">{pkg.inr}</span>
            </div>
          ))}
        </Reveal>

        <Reveal delay={0.1} className="mt-10 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <p className="max-w-md text-sm text-slate-600 leading-relaxed">
            All prices include 18% GST. Covers the full-day training, lunch and refreshments.
          </p>
          <Button asChild size="lg" className="rounded-full px-8 shadow-sm">
            <a href="#register">Reserve my seat</a>
          </Button>
        </Reveal>

        <Reveal delay={0.16} className="mt-10 rounded-2xl border border-slate-200/80 bg-white/70 p-6 backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
          <div className="grid max-w-xl gap-2 text-sm text-slate-600">
            <p><strong className="text-slate-900">Time:</strong> 9:15 am – 5:30 pm (reporting at 8:45 am)</p>
            <p><strong className="text-slate-900">Venue:</strong> to be confirmed (likely Four Points by Sheraton, Velachery, Chennai)</p>
            <p><strong className="text-slate-900">Seats:</strong> limited, confirmed on a first-paid basis</p>
          </div>
        </Reveal>

        <Reveal delay={0.2} className="mt-10 max-w-2xl rounded-2xl border border-slate-200/80 bg-white/70 p-6 backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">What to bring</p>
          <div className="mt-4 flex flex-col divide-y divide-slate-100">
            {requirements.map((r) => (
              <div
                key={r.item}
                className="grid grid-cols-1 sm:grid-cols-[1fr_220px] items-baseline gap-4 py-3 first:pt-0 last:pb-0"
              >
                <span className="text-sm font-medium text-slate-900">{r.item}</span>
                <span className="text-xs font-semibold text-primary sm:text-right">{r.need}</span>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// list — "Is this for you?"
export function Audience() {
  const items = [
    "You run a business or lead a team",
    "You use ChatGPT sometimes, but only scratch the surface",
    "You want to save hours every week, not just try new apps",
    "You're new to AI and want to start properly",
    "You're 16 or older",
  ];
  return (
    <section className="bg-white px-5 py-24 sm:px-7 border-t border-slate-100">
      <div className="mx-auto max-w-5xl">
        <Reveal>
          <SectionHeading className="text-[clamp(1.5rem,2.6vw,2.25rem)]">Is this for you?</SectionHeading>
        </Reveal>
        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {items.map((item, index) => (
            <Reveal key={item} delay={index * 0.05}>
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/70 p-5 backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">✓</span>
                <p className="text-base font-bold text-slate-900">{item}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

const FAQS = [
  { q: "I'm new to AI. Is Day 1 too advanced?", a: "No. Day 1 starts from the fundamentals and builds up step by step." },
  { q: "Can I attend only Day 2?", a: "Only if you have done our Day 1 before. If you haven't, take both days." },
  { q: "Do I get a certificate?", a: "[CERTIFICATION DETAILS: TO BE CONFIRMED]" },
  { q: "Do I really need the paid subscriptions?", a: "Yes. The sessions are hands-on, and free plans cut off the features we use. Please set them up before the day." },
  { q: "Is food included?", a: "Yes, lunch and refreshments on both days." },
  { q: "Can I bring my spouse or a colleague?", a: "Yes. Each person registers separately. Minimum age is 16." },
  { q: "What if I can't make it after paying?", a: "[CANCELLATION / TRANSFER POLICY: TO BE CONFIRMED]" },
  { q: "Will I get a GST invoice?", a: "Yes. Add your company and GSTIN details in the form." },
];

export function Faq() {
  return (
    <section id="faq" className="bg-white px-5 py-24 sm:px-7 border-t border-slate-100">
      <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-[1fr_2fr]">
        <Reveal>
          <SectionHeading className="text-[clamp(1.5rem,3vw,2.5rem)]">Questions</SectionHeading>
        </Reveal>
        <div className="flex flex-col gap-3">
          {FAQS.map((item, index) => (
            <Reveal key={item.q} delay={index * 0.03}>
              <details className="group rounded-2xl border border-slate-200/80 bg-white/70 p-5 backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-slate-900">
                  {item.q}
                  <span className="shrink-0 text-lg text-slate-400 transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-slate-600 border-t border-slate-100 pt-3">{item.a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

const CHENNAI_IMAGES = [
  { src: "/workshop/periamet-masjid-and-chennai-city-aerial-view.jpg", alt: "Aerial view of Chennai" },
  { src: "/workshop/chennai-city-centre.jpg", alt: "Chennai city centre, where this edition is hosted" },
  { src: "/workshop/sunrise-at-chennai-marina-beach.jpg", alt: "Sunrise at Chennai's Marina Beach" },
  { src: "/workshop/chennai-egmore-railway-station-in-chennai-city.jpg", alt: "Chennai Egmore railway station" },
];

export function CityBand() {
  return (
    <section className="bg-white py-12 px-5 sm:px-7 border-t border-slate-100">
      <div className="mx-auto max-w-5xl">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {CHENNAI_IMAGES.map((image) => (
            <div key={image.src} className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/70 shadow-sm aspect-[4/3]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.src}
                alt={image.alt}
                width={600}
                height={450}
                className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function WorkshopFooter() {
  return (
    <footer className="bg-white px-5 py-16 text-sm text-slate-600 sm:px-7 border-t border-slate-200">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-base font-extrabold text-slate-900">X Intelligence · xintelligence.in</p>
        <p>Contact: [PHONE / WHATSAPP] · [EMAIL]</p>
      </div>
      <div className="mx-auto mt-6 flex max-w-5xl flex-col gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-6 sm:flex-row sm:items-center sm:justify-between">
        <p>© 2026 X Intelligence</p>
        <p className="max-w-2xl text-xs text-slate-500 leading-relaxed">
          City pictures:{" "}
          <a className="underline hover:text-slate-800" href="https://commons.wikimedia.org/w/index.php?curid=160993109">
            &ldquo;Periamet Masjid and Chennai city aerial view&rdquo;
          </a>{" "}
          by Saiphani02, CC BY-SA 4.0;{" "}
          <a className="underline hover:text-slate-800" href="https://commons.wikimedia.org/w/index.php?curid=19778355">
            &ldquo;Chennai City Centre&rdquo;
          </a>{" "}
          by Soham Banerjee, CC BY 2.0;{" "}
          <a className="underline hover:text-slate-800" href="https://commons.wikimedia.org/w/index.php?curid=48631939">
            &ldquo;Sunrise at Chennai Marina beach&rdquo;
          </a>{" "}
          by Irfanahmed605, CC BY-SA 4.0;{" "}
          <a className="underline hover:text-slate-800" href="https://commons.wikimedia.org/w/index.php?curid=149794753">
            &ldquo;Chennai Egmore railway station&rdquo;
          </a>{" "}
          by Pinakpani, CC BY 4.0, via Wikimedia Commons.
        </p>
      </div>
    </footer>
  );
}
