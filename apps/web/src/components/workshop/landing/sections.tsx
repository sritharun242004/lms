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
    hidden: { opacity: 0, y: 28 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] } },
  };

  return (
    <motion.div
      className={className}
      style={style}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-10% 0px -10% 0px" }}
      variants={variants}
    >
      {children}
    </motion.div>
  );
}

function SectionHeading({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={`font-extrabold tracking-[-0.03em] leading-[0.95] text-foreground ${className}`}>
      {children}
    </h2>
  );
}

const NAV_LINKS = [
  { href: "#curriculum", label: "Curriculum" },
  { href: "#trainers", label: "Trainers" },
  { href: "#fees", label: "Fees" },
];

export function WorkshopNav() {
  return (
    <div className="absolute inset-x-0 top-0 z-30 flex items-center justify-between px-5 py-6 sm:px-7">
      <span className="text-base font-extrabold tracking-tight text-foreground">X Intelligence</span>
      <nav className="hidden items-center gap-7 text-sm font-semibold text-muted-foreground sm:flex">
        {NAV_LINKS.map((link) => (
          <a key={link.label} href={link.href} className="transition-colors hover:text-foreground">
            {link.label}
          </a>
        ))}
      </nav>
      <Button asChild size="sm" className="rounded-none px-5 !shadow-none sm:hidden">
        <a href="#register">Register</a>
      </Button>
    </div>
  );
}

// Hero — "One word, cropped": a single giant word (from the product's
// own name) overflows both screen edges in the lower half; everything
// else — wordmark, nav, the real description, the CTA — sits small in
// the upper third. The description sentence carries the page's h1,
// since it is the thing that actually tells a visitor what this is;
// the giant word is brand type, not the semantic title.
export function Hero() {
  return (
    <section className="relative min-h-[112svh] overflow-hidden bg-background sm:min-h-svh">
      <WorkshopNav />
      <div className="absolute left-5 top-24 z-20 max-w-xs sm:left-7 sm:top-28">
        <h1 className="text-[clamp(1.25rem,1.7vw,1.625rem)] font-semibold leading-tight text-foreground">
          A hands-on, 2-day AI empowerment workshop for professionals and business leaders.
        </h1>
        <p className="mt-3 max-w-[34ch] text-[clamp(1.0625rem,1.6vw,1.375rem)] leading-snug text-muted-foreground">
          Friends &amp; Family Edition, Chennai. You learn by doing, on your own work, with your own
          laptop.
        </p>
        <Button asChild size="lg" className="mt-5 rounded-none px-7 !shadow-none">
          <a href="#register">Reserve my seat</a>
        </Button>
      </div>
      <motion.p
        aria-hidden="true"
        initial={{ opacity: 0, scale: 1.04 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        className="pointer-events-none absolute -left-[10vw] bottom-0 select-none whitespace-nowrap text-[clamp(16rem,36vw,34rem)] font-extrabold leading-[0.8] tracking-[-0.05em] text-primary"
      >
        INTELLIGENCE
      </motion.p>
    </section>
  );
}

// stats — "One figure owns the screen": the single strongest number,
// alone, full height, with the other three WhyNow stats folded into
// the About section below rather than repeating this screen four times.
export function WhyNow() {
  return (
    <section className="flex flex-col gap-24 bg-background px-5 py-24 sm:px-7">
      <Reveal>
        <SectionHeading className="text-[clamp(1.5rem,3.2vw,2.75rem)]">
          AI adoption is already here.
        </SectionHeading>
      </Reveal>
      <Reveal delay={0.1} className="max-w-xl">
        <p className="text-[clamp(11.25rem,23vw,23.75rem)] font-extrabold leading-[0.8] tracking-[-0.04em] text-foreground">
          92<span className="align-top text-[0.3em] text-primary">%</span>
        </p>
        <p className="mt-4 max-w-[32ch] text-base leading-relaxed text-muted-foreground">
          of knowledge workers in India already use AI at work. The global figure is 75%.
        </p>
        <p className="mt-4 text-sm text-muted-foreground/70">Microsoft &amp; LinkedIn Work Trend Index, 2024</p>
      </Reveal>
    </section>
  );
}

// about — "Side facts, wide paragraph": the real About claim as a wide
// statement, with the lead-trainer fact and the other three WhyNow
// stats (54%, the BCG study, the Stanford/MIT figure) as side facts —
// nothing invented, this is the content the old page already had.
export function About() {
  const facts = [
    { label: "Lead trainer", value: "~50 organisations trained" },
    { label: "Format", value: "2 days, hands-on" },
    { label: "Edition", value: "Friends & family" },
  ];
  const sideStats = [
    { big: "54%", line: "of Indian leaders worry their company has no plan for AI.", source: "Microsoft & LinkedIn Work Trend Index, 2024" },
    { big: "25% / 40%", line: "faster and higher-quality work from BCG consultants using GPT-4.", source: "Harvard Business School & BCG, 2023" },
    { big: "+34%", line: "productivity gain for less experienced staff using an AI assistant.", source: "Stanford & MIT, NBER, 2023" },
  ];
  return (
    <section className="bg-background px-5 py-24 sm:px-7">
      <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[220px_1fr]">
        <Reveal className="flex flex-col gap-6">
          {facts.map((fact) => (
            <div key={fact.label}>
              <p className="text-sm font-semibold text-muted-foreground">{fact.label}</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{fact.value}</p>
            </div>
          ))}
        </Reveal>
        <div>
          <Reveal>
            <p className="max-w-[46ch] text-[clamp(1.5rem,2.3vw,1.875rem)] font-semibold leading-snug text-foreground">
              We run AI empowerment programs for founders, CXOs and senior leaders. Our focus is the
              AI mindset, not just the tools. Tools change every month. The way you think and work
              with them is what lasts.
            </p>
          </Reveal>
          <div className="mt-14 grid gap-10 sm:grid-cols-3">
            {sideStats.map((stat, index) => (
              <Reveal key={stat.big} delay={index * 0.08}>
                <p className="text-2xl font-extrabold text-foreground">{stat.big}</p>
                <p className="mt-2 text-base leading-relaxed text-muted-foreground">{stat.line}</p>
                <p className="mt-2 text-sm text-muted-foreground/60">{stat.source}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// how-it-works — "Lines that step across": the Journey's three stages
// as a staircase of short clauses, each starting further right.
export function Journey() {
  const stops = [
    { line: "First, you become fluent yourself.", detail: "Day 1: prompting, assistants, analytics, imaging, bots and agents." },
    { line: "Then your team builds with Claude.", detail: "Day 2: real work, your own data, workflows and vibe coding." },
    { line: "Keep going after the workshop.", detail: "Ask us about our 10-week coaching program." },
  ];
  return (
    <section className="bg-foreground px-5 py-24 text-background sm:px-7">
      <div className="mx-auto max-w-5xl">
        {stops.map((stop, index) => (
          <Reveal
            key={stop.line}
            delay={index * 0.1}
            className="py-5"
            style={{ marginLeft: `${index * 8}%` } as React.CSSProperties}
          >
            <p
              className={`max-w-3xl text-[clamp(1.5rem,4.6vw,3.5rem)] font-extrabold leading-[1] tracking-[-0.02em] ${
                index === stops.length - 1 ? "text-primary" : "text-background"
              }`}
            >
              {stop.line}
            </p>
            <p className="mt-3 max-w-[34ch] text-sm text-background/60">{stop.detail}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

// showcase — "Two giant words compared": Day 1 and Day 2 set side by
// side at poster scale, with the real eligibility line above them.
export function Outcomes() {
  return (
    <section className="overflow-hidden bg-background px-5 py-24 sm:px-7">
      <div className="mx-auto max-w-6xl">
        <Reveal className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <SectionHeading className="text-[clamp(1.5rem,2.6vw,2.25rem)]">From you, to your team.</SectionHeading>
          <p className="max-w-md text-base leading-relaxed text-muted-foreground">
            Day 2 is open only to people who have done Day 1 before, either earlier or on Day 1 of
            this edition.
          </p>
        </Reveal>
        <div className="mt-16 grid gap-14 sm:grid-cols-2">
          <Reveal>
            <p className="text-[clamp(3.5rem,11vw,7rem)] font-extrabold leading-[0.85] tracking-[-0.04em] text-foreground">
              Day 1
            </p>
            <p className="mt-4 max-w-[26ch] text-lg font-semibold text-muted-foreground">
              AI Empowerment for Professionals
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="text-[clamp(3.5rem,11vw,7rem)] font-extrabold leading-[0.85] tracking-[-0.04em] text-primary">
              Day 2
            </p>
            <p className="mt-4 max-w-[26ch] text-lg font-semibold text-muted-foreground">
              AI Empowerment for Business Leaders 2.0
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// features — "Capabilities as a menu": the full curriculum, both days,
// as two groups on one sheet.
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
    <section id="curriculum" className="bg-muted px-5 py-24 sm:px-7">
      <div className="mx-auto max-w-5xl">
        <Reveal>
          <SectionHeading className="text-[clamp(1.5rem,2.6vw,2.25rem)]">What we cover</SectionHeading>
        </Reveal>
        <div className="mt-14 grid gap-16 rounded-[2rem] bg-background p-8 sm:p-14 lg:grid-cols-2 lg:gap-20">
          <Reveal>
            <p className="text-lg font-bold text-foreground">Day 1: AI Empowerment for Professionals</p>
            <p className="mt-1 text-sm text-muted-foreground">
              From the fundamentals all the way up to agentic AI.
            </p>
            <ol className="mt-8 flex flex-col gap-6">
              {day1.map(([title, body]) => (
                <li key={title} className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                  <span className="text-base font-semibold text-foreground">{title}</span>
                  <span className="hidden flex-1 border-b-4 border-dotted border-muted-foreground/30 sm:block" />
                  <span className="text-sm text-muted-foreground sm:shrink-0 sm:text-right">{body}</span>
                </li>
              ))}
            </ol>
          </Reveal>
          <Reveal delay={0.08}>
            <p className="text-lg font-bold text-foreground">Day 2: AI Empowerment for Business Leaders 2.0</p>
            <p className="mt-1 text-sm text-muted-foreground">For Day 1 graduates. More hands-on, more depth.</p>
            <ol className="mt-8 flex flex-col gap-6">
              {day2.map(([title, body]) => (
                <li key={title} className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                  <span className="text-base font-semibold text-foreground">{title}</span>
                  <span className="hidden flex-1 border-b-4 border-dotted border-muted-foreground/30 sm:block" />
                  <span className="text-sm text-muted-foreground sm:shrink-0 sm:text-right">{body}</span>
                </li>
              ))}
            </ol>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// list (table) — "Line-up at one type size": the daily schedule as a
// clean, large-type programme.
export function DailySchedule() {
  const items = [
    { time: "8:45 am", label: "Reporting & check-in" },
    { time: "9:15 am", label: "We start: Learn, Try, Build, repeating each module" },
    { time: "", label: "Lunch & refreshments (included)" },
    { time: "5:30 pm", label: "Wrap-up" },
  ];
  return (
    <section className="bg-background px-5 py-24 sm:px-7">
      <div className="mx-auto max-w-4xl">
        <Reveal>
          <SectionHeading className="text-[clamp(1.5rem,2.6vw,2.25rem)]">A full day, mostly hands-on</SectionHeading>
        </Reveal>
        <div className="mt-14">
          {items.map((item, index) => (
            <Reveal key={index} delay={index * 0.05} className="flex items-baseline justify-between py-4">
              <span className="text-[clamp(1.25rem,2.1vw,1.875rem)] font-semibold text-foreground">{item.label}</span>
              <span className="shrink-0 pl-6 text-base tabular-nums text-muted-foreground">{item.time}</span>
            </Reveal>
          ))}
        </div>
        <p className="mt-10 max-w-[48ch] text-lg leading-relaxed text-foreground">
          Bring real work. That&apos;s where the learning sticks.
        </p>
      </div>
    </section>
  );
}

// list (two-ended rows) — outcomes, each paired with which day it
// comes from.
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
    <section className="bg-background px-5 py-24 sm:px-7">
      <div className="mx-auto max-w-3xl">
        <Reveal>
          <SectionHeading className="text-[clamp(1.5rem,2.6vw,2.25rem)]">
            You don&apos;t just watch. You build.
          </SectionHeading>
        </Reveal>
        <div className="mt-14">
          {items.map((item, index) => (
            <Reveal key={index} delay={index * 0.04} className="flex items-start justify-between gap-6 py-4">
              <span className="text-base text-foreground sm:text-lg">{item.text}</span>
              <span className="shrink-0 text-sm font-semibold text-primary">{item.day}</span>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// proof (table) — "Recognition as a table": who's teaching, set as a
// clean, ruleless table rather than three identical bordered cards.
export function Trainers() {
  const trainers = [
    { name: "Mehul Nanavati", role: "Lead Trainer", org: "Formerly Managing Director, Raj Petro Specialities", bio: "Decades of experience running a large enterprise. He has trained around 50 organisations in AI empowerment." },
    { name: "Philip Moses", role: "Trainer", org: "Founder & CEO, Belsterns Technologies", bio: "Leads the hands-on sessions on analytics, workflows and building with AI." },
    { name: "Madhan Raj", role: "Trainer", org: "Founder & CEO, The Bot Company", bio: "Leads the sessions on advanced imaging and building apps with AI." },
  ];
  return (
    <section id="trainers" className="bg-background px-5 py-24 sm:px-7">
      <div className="mx-auto max-w-4xl">
        <Reveal>
          <SectionHeading className="text-[clamp(1.5rem,2.6vw,2.25rem)]">Who&apos;s teaching</SectionHeading>
        </Reveal>
        <div className="mt-14">
          {trainers.map((trainer, index) => (
            <Reveal
              key={trainer.name}
              delay={index * 0.06}
              className={`grid gap-2 py-6 sm:grid-cols-[1fr_2fr] sm:gap-10 ${index % 2 === 1 ? "bg-muted" : ""} -mx-5 px-5 sm:-mx-6 sm:px-6`}
            >
              <div>
                <p className="text-lg font-bold text-foreground">{trainer.name}</p>
                <p className="text-sm font-semibold text-primary">{trainer.role}</p>
                <p className="mt-1 text-sm text-foreground/70">{trainer.org}</p>
              </div>
              <p className="text-base leading-relaxed text-foreground/80">{trainer.bio}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// pricing — three real packages, shown plainly: no crossed-out base
// price, no invented savings beyond the one real USD 36 the Day1+Day2
// bundle actually saves vs booking separately.
export function Pricing() {
  const packages = [
    { label: "Day 1 only", usd: "USD 252", inr: "₹28,250", note: "₹23,940 + 18% GST" },
    { label: "Day 2 only", usd: "USD 279", inr: "₹31,275", note: "₹26,505 + 18% GST" },
    { label: "Day 1 + Day 2", usd: "USD 495 — save USD 36", inr: "₹55,490", note: "₹47,025 + 18% GST" },
  ];
  const requirements = [
    { item: "Laptop (no iPads)", need: "Both days" },
    { item: "ChatGPT Business or Claude Pro", need: "Day 1, at least one" },
    { item: "Claude Pro and ChatGPT Business", need: "Day 2, both" },
    { item: "Microsoft Copilot Studio", need: "Good to have on Day 2" },
  ];
  return (
    <section id="fees" className="flex flex-col bg-foreground px-5 py-32 text-background sm:px-7">
      <div className="mx-auto w-full max-w-5xl">
        <Reveal>
          <SectionHeading className="text-background text-[clamp(1.75rem,3.4vw,2.75rem)]">Fees</SectionHeading>
        </Reveal>
        <Reveal delay={0.08} className="mt-12 flex flex-col">
          {packages.map((pkg, index) => (
            <div
              key={pkg.label}
              className={`flex flex-col gap-1 py-6 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6 ${index % 2 === 0 ? "bg-background/5" : ""} px-4`}
            >
              <span className="text-lg font-bold">{pkg.label}</span>
              <span className="text-sm text-background/60">{pkg.note}</span>
              <span className="text-sm text-background/60">{pkg.usd}</span>
              <span className="text-2xl font-extrabold text-primary">{pkg.inr}</span>
            </div>
          ))}
        </Reveal>
        <Reveal delay={0.1} className="mt-10 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <p className="max-w-md text-base text-background/70">
            All prices include 18% GST. Covers the full-day training, lunch and refreshments.
          </p>
          <Button asChild size="lg" variant="secondary" className="rounded-none px-8 !shadow-none">
            <a href="#register">Reserve my seat</a>
          </Button>
        </Reveal>
        <Reveal delay={0.16} className="mt-10 grid max-w-xl gap-2 text-sm text-background/60">
          <p>Time: 9:15 am – 5:30 pm (reporting at 8:45 am)</p>
          <p>Venue: to be confirmed (likely Four Points by Sheraton, Velachery, Chennai)</p>
          <p>Seats: limited, confirmed on a first-paid basis</p>
        </Reveal>
        <Reveal delay={0.2} className="mt-16 max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-background/50">What to bring</p>
          <div className="mt-5 flex flex-col gap-1">
            {requirements.map((r, index) => (
              <div
                key={r.item}
                className={`flex items-baseline justify-between gap-6 px-4 py-3 ${index % 2 === 0 ? "bg-background/5" : ""}`}
              >
                <span className="text-sm text-background">{r.item}</span>
                <span className="shrink-0 text-sm text-background/60">{r.need}</span>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// list (poster) — "Is this for you?" as a short poster list.
export function Audience() {
  const items = [
    "You run a business or lead a team",
    "You use ChatGPT sometimes, but only scratch the surface",
    "You want to save hours every week, not just try new apps",
    "You're new to AI and want to start properly",
    "You're 16 or older",
  ];
  return (
    <section className="bg-background px-5 py-24 sm:px-7">
      <div className="mx-auto max-w-5xl">
        <Reveal>
          <SectionHeading className="text-[clamp(1.5rem,2.6vw,2.25rem)]">Is this for you?</SectionHeading>
        </Reveal>
        <div className="mt-14 flex flex-col gap-3">
          {items.map((item, index) => (
            <Reveal key={item} delay={index * 0.05}>
              <p className="text-[clamp(1.25rem,3.4vw,2.75rem)] font-bold leading-[1.05] tracking-[-0.02em] text-foreground transition-colors hover:text-primary">
                {item}
              </p>
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
    <section id="faq" className="bg-background px-5 py-24 sm:px-7">
      <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-[1fr_2fr]">
        <Reveal>
          <SectionHeading className="text-[clamp(1.5rem,3vw,2.5rem)]">Questions</SectionHeading>
        </Reveal>
        <div className="flex flex-col gap-2">
          {FAQS.map((item, index) => (
            <Reveal key={item.q} delay={index * 0.03}>
              <details className="group rounded-2xl px-4 py-4 open:bg-muted">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold text-foreground">
                  {item.q}
                  <span className="shrink-0 text-xl text-muted-foreground transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 max-w-[48ch] text-base leading-relaxed text-muted-foreground">{item.a}</p>
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

// One real-image band — the honest answer for "no photographs of the
// workshop itself exist yet": real, credited pictures of the host
// city, never presented as the workshop's own.
export function CityBand() {
  return (
    <section className="grid gap-px overflow-hidden bg-foreground sm:grid-cols-4">
      {CHENNAI_IMAGES.map((image) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={image.src}
          src={image.src}
          alt={image.alt}
          width={1920}
          height={1280}
          className="h-64 w-full object-cover grayscale sm:h-80"
        />
      ))}
    </section>
  );
}

export function WorkshopFooter() {
  return (
    <footer className="bg-background px-5 py-16 text-sm text-muted-foreground sm:px-7">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-base font-extrabold text-foreground">X Intelligence · xintelligence.in</p>
        <p>Contact: [PHONE / WHATSAPP] · [EMAIL]</p>
      </div>
      <div className="mx-auto mt-6 flex max-w-6xl flex-col gap-3 rounded-2xl bg-muted p-6 sm:flex-row sm:items-center sm:justify-between">
        <p>© 2026 X Intelligence</p>
        <p className="max-w-2xl text-sm text-muted-foreground/70">
          City pictures:{" "}
          <a className="underline" href="https://commons.wikimedia.org/w/index.php?curid=160993109">
            &ldquo;Periamet Masjid and Chennai city aerial view&rdquo;
          </a>{" "}
          by Saiphani02,{" "}
          <a className="underline" href="https://creativecommons.org/licenses/by-sa/4.0/">
            CC BY-SA 4.0
          </a>
          ;{" "}
          <a className="underline" href="https://commons.wikimedia.org/w/index.php?curid=19778355">
            &ldquo;Chennai City Centre&rdquo;
          </a>{" "}
          by Soham Banerjee,{" "}
          <a className="underline" href="https://creativecommons.org/licenses/by/2.0/">
            CC BY 2.0
          </a>
          ;{" "}
          <a className="underline" href="https://commons.wikimedia.org/w/index.php?curid=48631939">
            &ldquo;Sunrise at Chennai Marina beach&rdquo;
          </a>{" "}
          by Irfanahmed605,{" "}
          <a className="underline" href="https://creativecommons.org/licenses/by-sa/4.0/">
            CC BY-SA 4.0
          </a>
          ;{" "}
          <a className="underline" href="https://commons.wikimedia.org/w/index.php?curid=149794753">
            &ldquo;Chennai Egmore railway station&rdquo;
          </a>{" "}
          by Pinakpani,{" "}
          <a className="underline" href="https://creativecommons.org/licenses/by/4.0/">
            CC BY 4.0
          </a>
          , via Wikimedia Commons.
        </p>
      </div>
    </footer>
  );
}
