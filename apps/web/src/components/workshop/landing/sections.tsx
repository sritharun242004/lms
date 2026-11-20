"use client";

import * as React from "react";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { Button } from "@/components/ui/button";

const SERIF = "font-[family-name:var(--font-fraunces)]";

// Scroll-triggered fade/rise, skipped entirely for a visitor who has
// asked for reduced motion — content renders in its final state
// immediately rather than ever being animated for them.
function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return <div className={className}>{children}</div>;

  const variants: Variants = {
    hidden: { opacity: 0, y: 28 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] } },
  };

  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-10% 0px -10% 0px" }}
      variants={variants}
    >
      {children}
    </motion.div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-[.22em] text-primary">{children}</p>
  );
}

const NAV_LINKS = [
  { href: "#curriculum", label: "Program" },
  { href: "#curriculum", label: "Curriculum" },
  { href: "#trainers", label: "Trainers" },
  { href: "#fees", label: "Fees" },
  { href: "#faq", label: "FAQ" },
];

export function WorkshopNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className={`${SERIF} text-lg font-medium tracking-tight text-foreground`}>X Intelligence</span>
        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          {NAV_LINKS.map((link) => (
            <a key={link.label} href={link.href} className="transition-colors hover:text-foreground">
              {link.label}
            </a>
          ))}
        </nav>
        <Button asChild size="sm" variant="outline" className="rounded-full">
          <a href="#register">Register</a>
        </Button>
      </div>
    </header>
  );
}

export function Hero() {
  return (
    <section className="mx-auto grid max-w-6xl gap-10 px-6 pt-20 pb-24 md:grid-cols-[1.3fr_1fr] md:gap-16 md:pt-28">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[.22em] text-primary">
          Friends &amp; Family Edition · 26-27 Nov 2026 · Chennai
        </p>
        <h1 className={`${SERIF} mt-6 text-5xl font-medium leading-[1.05] tracking-tight text-foreground sm:text-6xl lg:text-7xl`}>
          AI that works
          <br />
          for you.
        </h1>
        <p className="mt-6 max-w-md text-lg leading-relaxed text-muted-foreground">
          A hands-on, 2-day workshop for professionals and business leaders. You learn by doing,
          on your own work, with your own laptop.
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-6">
          <Button asChild size="lg" className="rounded-full px-7">
            <a href="#register">Reserve my seat</a>
          </Button>
          <a href="#curriculum" className="text-sm font-medium text-foreground underline-offset-4 hover:underline">
            See the curriculum ↓
          </a>
        </div>
        <dl className="mt-14 grid grid-cols-2 gap-6 border-t border-border pt-6 text-sm text-muted-foreground sm:grid-cols-4">
          <div>Thu 26 &amp; Fri 27 Nov</div>
          <div>9:15 am – 5:30 pm</div>
          <div>Chennai (venue TBC)</div>
          <div>Day 1 certification via Vjal Institute</div>
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">Limited seats. Confirmed on a first-paid basis.</p>
      </div>

      <div className="flex flex-col justify-end border-t border-border pt-8 md:border-t-0 md:border-l md:pt-0 md:pl-12">
        <p className={`${SERIF} text-6xl font-medium leading-none text-primary`}>92%</p>
        <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
          of knowledge workers in India already use AI at work. The global figure is 75%.
        </p>
        <p className="mt-3 text-xs uppercase tracking-wide text-muted-foreground/70">
          Microsoft &amp; LinkedIn Work Trend Index, 2024
        </p>
      </div>
    </section>
  );
}

const CLIPPINGS = [
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
    big: "25% faster, 40% better",
    line: "BCG consultants using GPT-4 finished tasks 25% faster, with 40% higher quality work.",
    source: "Harvard Business School & BCG study, 2023",
  },
  {
    big: "+34%",
    line: "productivity for newer, less experienced staff using an AI assistant. The average gain was 14%.",
    source: "Stanford & MIT, NBER working paper, 2023",
  },
];

export function WhyNow() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24">
      <Reveal>
        <h2 className={`${SERIF} text-3xl font-medium tracking-tight sm:text-4xl`}>The numbers are already in.</h2>
      </Reveal>
      <div className="mt-14 grid gap-10 border-t border-border pt-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
        {CLIPPINGS.map((item, index) => (
          <Reveal key={item.big} delay={index * 0.08}>
            <p className={`${SERIF} text-4xl font-medium text-foreground`}>{item.big}</p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.line}</p>
            <p className="mt-4 text-[11px] uppercase tracking-wide text-muted-foreground/60">{item.source}</p>
          </Reveal>
        ))}
      </div>
      <p className="mt-14 max-w-2xl text-balance text-lg leading-relaxed text-foreground">
        Everyone has the tools. Very few know how to use them well. That gap is what these two
        days close.
      </p>
    </section>
  );
}

export function About() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-24">
      <Reveal>
        <SectionLabel>X Intelligence</SectionLabel>
        <p className={`${SERIF} mt-5 text-3xl font-medium leading-snug tracking-tight sm:text-4xl`}>
          We run AI empowerment programs for founders, CXOs and senior leaders. Our focus is the
          AI mindset, not just the tools.
        </p>
        <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
          Tools change every month. The way you think and work with them is what lasts.
        </p>
        <p className="mt-8 text-sm font-medium text-foreground">
          Our lead trainer has trained around 50 organisations in AI empowerment.
        </p>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          This edition is a small, specially priced round for friends and family. It runs on the
          same content as our corporate program, adjusted for your kind of work.
        </p>
      </Reveal>
    </section>
  );
}

export function Journey() {
  const stops = [
    { label: "Me + AI", sub: "Day 1 · Track 1", line: "Get fluent. Prompting, assistants, analytics, imaging, bots and agents. From basics to agentic AI." },
    { label: "Team + AI", sub: "Day 2 · Track 2", line: "Go deeper. Claude for real work, analytics on your data, workflows, vibe coding, advanced imaging." },
    { label: "Keep going", sub: "What's next", line: "Ask us about our 10-week coaching program." },
  ];
  return (
    <section className="mx-auto max-w-6xl px-6 py-24">
      <Reveal>
        <h2 className={`${SERIF} text-3xl font-medium tracking-tight sm:text-4xl`}>From you, to your team.</h2>
      </Reveal>
      <div className="mt-14 grid gap-0 border-t border-border md:grid-cols-3">
        {stops.map((stop, index) => (
          <Reveal
            key={stop.label}
            delay={index * 0.1}
            className={`border-b border-border py-8 md:border-b-0 md:border-r md:py-10 md:pr-8 ${index > 0 ? "md:pl-8" : ""} ${index === stops.length - 1 ? "md:border-r-0" : ""}`}
          >
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">{stop.sub}</p>
            <p className={`${SERIF} mt-3 text-2xl font-medium`}>{stop.label}</p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{stop.line}</p>
          </Reveal>
        ))}
      </div>
      <p className="mt-8 text-sm text-muted-foreground">
        Day 2 is open only to people who have done Day 1, either earlier or on 26 Nov.
      </p>
    </section>
  );
}

export function Curriculum() {
  return (
    <section id="curriculum" className="mx-auto max-w-6xl px-6 py-24">
      <Reveal>
        <h2 className={`${SERIF} text-3xl font-medium tracking-tight sm:text-4xl`}>What we cover</h2>
      </Reveal>
      <div className="mt-14 grid gap-14 border-t border-border pt-10 md:grid-cols-2 md:gap-16">
        <Reveal>
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">Day 1 · Thu 26 Nov</p>
          <h3 className={`${SERIF} mt-2 text-2xl font-medium`}>AI Empowerment for Professionals</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            From the fundamentals all the way up to agentic AI. Certification through the Vjal
            Institute.
          </p>
          <ol className="mt-6 flex flex-col gap-5">
            {[
              ["AI for everyday productivity", "the tools that save you real hours every week"],
              ["Smart prompting", "how to ask so you get usable answers the first time"],
              ["Your own AI assistants", "build and customise assistants for your work"],
              ["Beyond chat", "analytics, imaging, bots and agentic AI, shown through real use cases"],
            ].map(([title, body], index) => (
              <li key={title} className="flex gap-4">
                <span className={`${SERIF} text-lg text-muted-foreground/50`}>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <p className="font-medium text-foreground">{title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">Day 2 · Fri 27 Nov</p>
          <h3 className={`${SERIF} mt-2 text-2xl font-medium`}>AI Empowerment for Business Leaders 2.0</h3>
          <p className="mt-2 text-sm text-muted-foreground">For Day 1 graduates. More hands-on, more depth.</p>
          <ol className="mt-6 flex flex-col gap-5">
            {[
              ["Quick recap", "of Day 1"],
              ["Claude, hands-on", "using it for real day-to-day work"],
              ["AI analytics", "on your kind of data"],
              ["AI-enabled workflows", "set them up once and they run with very little effort"],
              ["Vibe coding", "build simple apps and interfaces without writing code yourself"],
              ["Advanced imaging", "professional-quality visuals, concepts and techniques"],
            ].map(([title, body], index) => (
              <li key={title} className="flex gap-4">
                <span className={`${SERIF} text-lg text-muted-foreground/50`}>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <p className="font-medium text-foreground">{title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </Reveal>
      </div>
    </section>
  );
}

export function Outcomes() {
  const tiles = [
    { day: "Day 1", text: "A custom AI assistant built for a task you do every week" },
    { day: "Day 1", text: "A prompt approach you can reuse for any task" },
    { day: "Day 1", text: "Hands-on time with images, analytics and agents" },
    { day: "Day 2", text: "A dashboard or analysis made from your own kind of data" },
    { day: "Day 2", text: "A working automated workflow" },
    { day: "Day 2", text: "A simple app or interface you built yourself" },
  ];
  return (
    <section className="mx-auto max-w-6xl px-6 py-24">
      <Reveal>
        <h2 className={`${SERIF} text-3xl font-medium tracking-tight sm:text-4xl`}>
          You don&apos;t just watch. You build.
        </h2>
      </Reveal>
      <div className="mt-14 grid gap-x-10 gap-y-8 border-t border-border pt-10 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((tile, index) => (
          <Reveal key={index} delay={(index % 3) * 0.08}>
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">{tile.day}</p>
            <p className="mt-2 text-sm leading-relaxed text-foreground">{tile.text}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

export function DailySchedule() {
  const items = [
    { time: "8:45 am", label: "Reporting & check-in" },
    { time: "9:15 am", label: "We start — Learn, Try, Build, repeating each module" },
    { time: "", label: "Lunch & refreshments (included)" },
    { time: "5:30 pm", label: "Wrap-up" },
  ];
  return (
    <section className="mx-auto max-w-2xl px-6 py-24">
      <Reveal>
        <h2 className={`${SERIF} text-3xl font-medium tracking-tight sm:text-4xl`}>A full day. Mostly hands-on.</h2>
      </Reveal>
      <ol className="mt-12 flex flex-col gap-6 border-t border-border pt-10">
        {items.map((item, index) => (
          <Reveal key={index} delay={index * 0.06} className="flex gap-6 text-sm">
            <span className="w-20 shrink-0 font-medium text-primary">{item.time}</span>
            <span className="text-muted-foreground">{item.label}</span>
          </Reveal>
        ))}
      </ol>
      <p className="mt-10 text-lg leading-relaxed text-foreground">
        Bring real work. That&apos;s where the learning sticks.
      </p>
    </section>
  );
}

export function Audience() {
  const items = [
    "You run a business or lead a team",
    "You use ChatGPT sometimes, but feel you are only scratching the surface",
    "You want to save hours every week, not just try new apps",
    "You are new to AI and want to start properly (Day 1 starts from the basics)",
    "You are 16 or older",
  ];
  return (
    <section className="mx-auto max-w-2xl px-6 py-24">
      <Reveal>
        <h2 className={`${SERIF} text-3xl font-medium tracking-tight sm:text-4xl`}>Is this for you?</h2>
      </Reveal>
      <ul className="mt-10 flex flex-col gap-4 border-t border-border pt-8 text-base">
        {items.map((item, index) => (
          <Reveal key={item} delay={index * 0.05} className="flex gap-3">
            <span className="text-primary">—</span>
            <span className="text-foreground">{item}</span>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}

const TRAINERS = [
  {
    name: "Mehul Nanavati",
    role: "Lead Trainer",
    bio: "Former Managing Director, Raj Petro Specialities. Decades of experience running a large enterprise. He has trained around 50 organisations in AI empowerment.",
  },
  {
    name: "Philip Moses",
    role: "Trainer",
    bio: "Founder & CEO, Belsterns Technologies. Leads the hands-on sessions on analytics, workflows and building with AI.",
  },
  {
    name: "Madhan Raj",
    role: "Trainer",
    bio: "Founder & CEO, The Bot Company, an AI agency. Leads the sessions on advanced imaging and building apps with AI.",
  },
];

export function Trainers() {
  return (
    <section id="trainers" className="mx-auto max-w-4xl px-6 py-24">
      <Reveal>
        <h2 className={`${SERIF} text-3xl font-medium tracking-tight sm:text-4xl`}>Who&apos;s teaching</h2>
      </Reveal>
      <div className="mt-14 flex flex-col divide-y divide-border border-t border-border">
        {TRAINERS.map((trainer, index) => (
          <Reveal
            key={trainer.name}
            delay={index * 0.08}
            className="grid gap-2 py-8 sm:grid-cols-[1fr_2fr] sm:gap-10"
          >
            <div>
              <p className={`${SERIF} text-xl font-medium`}>{trainer.name}</p>
              <p className="mt-1 text-xs font-medium uppercase tracking-wide text-primary">{trainer.role}</p>
              <p className="mt-2 text-xs text-muted-foreground/70">Photo pending</p>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">{trainer.bio}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

const PACKAGES = [
  { key: "DAY1", label: "Day 1 only", base: "₹23,940", incl: "₹28,250", small: "USD 252", button: "Reserve Day 1", best: false },
  { key: "BOTH", label: "Day 1 + Day 2", base: "₹47,025", incl: "₹55,490", small: "USD 495 · save USD 36 vs booking separately", button: "Reserve both days", best: true },
  { key: "DAY2", label: "Day 2 only", base: "₹26,505", incl: "₹31,275", small: "USD 279 · for Day 1 graduates only", button: "Reserve Day 2", best: false },
] as const;

export function Pricing() {
  return (
    <section id="fees" className="mx-auto max-w-6xl px-6 py-24">
      <Reveal>
        <h2 className={`${SERIF} text-3xl font-medium tracking-tight sm:text-4xl`}>Fees</h2>
      </Reveal>
      <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-3">
        {PACKAGES.map((pkg, index) => (
          <Reveal
            key={pkg.key}
            delay={index * 0.08}
            className={`flex flex-col gap-4 bg-background p-8 ${pkg.best ? "relative" : ""}`}
          >
            {pkg.best ? (
              <span className="absolute right-6 top-6 text-xs font-semibold uppercase tracking-wide text-primary">
                Best value
              </span>
            ) : null}
            <p className="text-sm font-medium text-muted-foreground">{pkg.label}</p>
            <div>
              <p className="text-sm text-muted-foreground/60 line-through">{pkg.base}</p>
              <p className={`${SERIF} text-4xl font-medium ${pkg.best ? "text-primary" : "text-foreground"}`}>{pkg.incl}</p>
              <p className="mt-1 text-xs text-muted-foreground">{pkg.small}</p>
            </div>
            <Button asChild variant={pkg.best ? "default" : "outline"} className="mt-2 w-full rounded-full">
              <a href={`?package=${pkg.key}#register`}>{pkg.button}</a>
            </Button>
          </Reveal>
        ))}
      </div>
      <p className="mt-8 text-sm leading-relaxed text-muted-foreground">
        Fees cover the full-day training, lunch and refreshments. This friends-and-family round is
        priced well below our usual corporate rates.
      </p>
      <dl className="mt-10 grid max-w-md gap-2 border-t border-border pt-8 text-sm text-muted-foreground">
        <div><span className="font-medium text-foreground">Dates:</span> Thu 26 Nov and Fri 27 Nov 2026</div>
        <div><span className="font-medium text-foreground">Time:</span> 9:15 am - 5:30 pm (reporting at 8:45 am)</div>
        <div><span className="font-medium text-foreground">Venue:</span> to be confirmed (likely Four Points by Sheraton, Velachery, Chennai)</div>
        <div><span className="font-medium text-foreground">Seats:</span> limited, confirmed on a first-paid basis</div>
      </dl>
    </section>
  );
}

export function WhatToBring() {
  return (
    <section className="mx-auto max-w-2xl px-6 py-24">
      <Reveal>
        <h2 className={`${SERIF} text-3xl font-medium tracking-tight sm:text-4xl`}>Before you come</h2>
      </Reveal>
      <table className="mt-12 w-full border-t border-border text-sm">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-3"> </th>
            <th className="py-3 font-medium">Day 1</th>
            <th className="py-3 font-medium">Day 2</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-border">
            <td className="py-4">Laptop (no iPads)</td>
            <td className="py-4">Required</td>
            <td className="py-4">Required</td>
          </tr>
          <tr className="border-t border-border">
            <td className="py-4">ChatGPT Business or Claude Pro</td>
            <td className="py-4">Required, at least one</td>
            <td className="py-4"></td>
          </tr>
          <tr className="border-t border-border">
            <td className="py-4">Claude Pro and ChatGPT Business</td>
            <td className="py-4"></td>
            <td className="py-4">Required, both</td>
          </tr>
          <tr className="border-t border-border">
            <td className="py-4">Microsoft Copilot Studio</td>
            <td className="py-4"></td>
            <td className="py-4">Good to have. Without it, you can follow the workflows in demo mode.</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

const FAQS = [
  { q: "I'm new to AI. Is Day 1 too advanced?", a: "No. Day 1 starts from the fundamentals and builds up step by step." },
  { q: "Can I attend only Day 2?", a: "Only if you have done our Day 1 before. If you haven't, take both days." },
  { q: "Do I get a certificate?", a: "Yes. Day 1 is a certification program through the Vjal Institute." },
  { q: "Do I really need the paid subscriptions?", a: "Yes. The sessions are hands-on, and free plans cut off the features we use. Please set them up before the day." },
  { q: "Is food included?", a: "Yes, lunch and refreshments on both days." },
  { q: "Can I bring my spouse or a colleague?", a: "Yes. Each person registers separately. Minimum age is 16." },
  { q: "What if I can't make it after paying?", a: "[CANCELLATION / TRANSFER POLICY: TO BE CONFIRMED]" },
  { q: "Will I get a GST invoice?", a: "Yes. Add your company and GSTIN details in the form." },
];

export function Faq() {
  return (
    <section id="faq" className="mx-auto max-w-2xl px-6 py-24">
      <Reveal>
        <h2 className={`${SERIF} text-3xl font-medium tracking-tight sm:text-4xl`}>FAQ</h2>
      </Reveal>
      <div className="mt-12 flex flex-col divide-y divide-border border-t border-border">
        {FAQS.map((item) => (
          <details key={item.q} className="group py-5">
            <summary className="flex cursor-pointer items-center justify-between text-sm font-medium text-foreground">
              {item.q}
              <span className="ml-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-45">+</span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function WorkshopFooter() {
  return (
    <footer className="border-t border-border px-6 py-14 text-sm text-muted-foreground">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className={`${SERIF} text-foreground`}>X Intelligence · xintelligence.in</p>
        <p>Contact: [PHONE / WHATSAPP] · [EMAIL]</p>
      </div>
      <div className="mx-auto mt-6 flex max-w-6xl flex-col gap-1 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p>Day 1 certification in partnership with the Vjal Institute</p>
        <p>© 2026 X Intelligence</p>
      </div>
    </footer>
  );
}
