import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const NAV_LINKS = [
  { href: "#curriculum", label: "Program" },
  { href: "#curriculum", label: "Curriculum" },
  { href: "#trainers", label: "Trainers" },
  { href: "#fees", label: "Fees" },
  { href: "#faq", label: "FAQ" },
];

export function WorkshopNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <span className="text-lg font-bold tracking-tight text-primary">X Intelligence</span>
        <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
          {NAV_LINKS.map((link) => (
            <a key={link.label} href={link.href} className="hover:text-foreground">
              {link.label}
            </a>
          ))}
        </nav>
        <Button asChild size="sm">
          <a href="#register">Register</a>
        </Button>
      </div>
    </header>
  );
}

export function Hero() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-20 text-center">
      <p className="text-xs font-semibold uppercase tracking-[.16em] text-primary">
        Friends &amp; Family Edition · 26-27 Nov 2026 · Chennai
      </p>
      <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
        AI that works for you. Not the other way around.
      </h1>
      <p className="mt-5 text-lg text-muted-foreground">
        A hands-on, 2-day workshop for professionals and business leaders. You learn by doing, on your
        own work, with your own laptop.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button asChild size="lg">
          <a href="#register">Reserve my seat</a>
        </Button>
        <a href="#curriculum" className="text-sm font-medium text-primary hover:underline">
          See the curriculum ↓
        </a>
      </div>
      <dl className="mt-10 grid grid-cols-2 gap-4 text-sm text-muted-foreground sm:grid-cols-4">
        <div>📅 Thu 26 &amp; Fri 27 Nov</div>
        <div>⏰ 9:15 am - 5:30 pm</div>
        <div>📍 Chennai (venue TBC)</div>
        <div>🎓 Day 1 certification via Vjal Institute</div>
      </dl>
      <p className="mt-4 text-xs text-muted-foreground">Limited seats. Confirmed on a first-paid basis.</p>
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
    <section className="mx-auto max-w-6xl px-6 py-20">
      <h2 className="text-center text-3xl font-bold tracking-tight">The numbers are already in.</h2>
      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {CLIPPINGS.map((item, index) => (
          <Card
            key={item.big}
            className={`bg-card/80 ${index % 2 === 0 ? "-rotate-1" : "rotate-1"}`}
          >
            <CardContent className="p-6">
              <p className="text-3xl font-bold text-primary">{item.big}</p>
              <p className="mt-2 text-sm">{item.line}</p>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {item.source}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="mt-10 text-center text-muted-foreground">
        Everyone has the tools. Very few know how to use them well. That gap is what these two days
        close.
      </p>
    </section>
  );
}

export function About() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-20 text-center">
      <h2 className="text-3xl font-bold tracking-tight">X Intelligence</h2>
      <p className="mt-5 text-muted-foreground">
        We run AI empowerment programs for founders, CXOs and senior leaders. Our focus is the AI
        mindset, not just the tools. Tools change every month. The way you think and work with them is
        what lasts.
      </p>
      <p className="mt-4 text-sm font-medium">
        Our lead trainer has trained around 50 organisations in AI empowerment.
      </p>
      <p className="mt-4 text-sm text-muted-foreground">
        This edition is a small, specially priced round for friends and family. It runs on the same
        content as our corporate program, adjusted for your kind of work.
      </p>
    </section>
  );
}

export function Journey() {
  const stops = [
    { label: "Me + AI", sub: "DAY 1 · Track 1", line: "Get fluent. Prompting, assistants, analytics, imaging, bots and agents. From basics to agentic AI." },
    { label: "Team + AI", sub: "DAY 2 · Track 2", line: "Go deeper. Claude for real work, analytics on your data, workflows, vibe coding, advanced imaging." },
    { label: "Keep going", sub: "WHAT'S NEXT", line: "Ask us about our 10-week coaching program." },
  ];
  return (
    <section className="mx-auto max-w-5xl px-6 py-20">
      <h2 className="text-center text-3xl font-bold tracking-tight">From you, to your team.</h2>
      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {stops.map((stop) => (
          <Card key={stop.label}>
            <CardContent className="p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">{stop.sub}</p>
              <p className="mt-2 text-xl font-bold">{stop.label}</p>
              <p className="mt-3 text-sm text-muted-foreground">{stop.line}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="mt-6 text-center text-xs text-muted-foreground">
        Day 2 is open only to people who have done Day 1, either earlier or on 26 Nov.
      </p>
    </section>
  );
}

export function Curriculum() {
  return (
    <section id="curriculum" className="mx-auto max-w-5xl px-6 py-20">
      <h2 className="text-center text-3xl font-bold tracking-tight">What we cover</h2>
      <div className="mt-10 grid gap-8 md:grid-cols-2">
        <Card>
          <CardContent className="p-6">
            <p className="text-sm font-semibold text-primary">Day 1 · Thu 26 Nov</p>
            <h3 className="mt-1 text-lg font-bold">AI Empowerment for Professionals</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              From the fundamentals all the way up to agentic AI. Certification through the Vjal
              Institute.
            </p>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm">
              <li><strong>AI for everyday productivity:</strong> the tools that save you real hours every week</li>
              <li><strong>Smart prompting:</strong> how to ask so you get usable answers the first time</li>
              <li><strong>Your own AI assistants:</strong> build and customise assistants for your work</li>
              <li><strong>Beyond chat:</strong> analytics, imaging, bots and agentic AI, shown through real use cases</li>
            </ol>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-sm font-semibold text-primary">Day 2 · Fri 27 Nov</p>
            <h3 className="mt-1 text-lg font-bold">AI Empowerment for Business Leaders 2.0</h3>
            <p className="mt-1 text-sm text-muted-foreground">For Day 1 graduates. More hands-on, more depth.</p>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm">
              <li><strong>Quick recap</strong> of Day 1</li>
              <li><strong>Claude, hands-on:</strong> using it for real day-to-day work</li>
              <li><strong>AI analytics:</strong> on your kind of data</li>
              <li><strong>AI-enabled workflows:</strong> set them up once and they run with very little effort</li>
              <li><strong>Vibe coding:</strong> build simple apps and interfaces without writing code yourself</li>
              <li><strong>Advanced imaging:</strong> professional-quality visuals, concepts and techniques</li>
            </ol>
          </CardContent>
        </Card>
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
    <section className="mx-auto max-w-5xl px-6 py-20">
      <h2 className="text-center text-3xl font-bold tracking-tight">You don&apos;t just watch. You build.</h2>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((tile, index) => (
          <Card key={index}>
            <CardContent className="p-5">
              <Badge variant="secondary">{tile.day}</Badge>
              <p className="mt-3 text-sm">{tile.text}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

export function DailySchedule() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-20">
      <h2 className="text-center text-3xl font-bold tracking-tight">A full day. Mostly hands-on.</h2>
      <ol className="mt-10 space-y-6 border-l border-border pl-6 text-sm">
        <li><span className="font-semibold">8:45 am</span> — Reporting &amp; check-in</li>
        <li>
          <span className="font-semibold">9:15 am</span> — We start
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            <li>Learn: see it done, on real examples</li>
            <li>Try: do it on your own laptop</li>
            <li>Build: apply it to your own work (repeats each module)</li>
          </ul>
        </li>
        <li>Lunch &amp; refreshments (included)</li>
        <li><span className="font-semibold">5:30 pm</span> — Wrap-up</li>
      </ol>
      <p className="mt-6 text-center text-muted-foreground">Bring real work. That&apos;s where the learning sticks.</p>
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
    <section className="mx-auto max-w-2xl px-6 py-20">
      <h2 className="text-center text-3xl font-bold tracking-tight">Is this for you?</h2>
      <ul className="mt-8 space-y-3 text-sm">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span>✅</span>
            <span>{item}</span>
          </li>
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
    <section id="trainers" className="mx-auto max-w-5xl px-6 py-20">
      <h2 className="text-center text-3xl font-bold tracking-tight">Who&apos;s teaching</h2>
      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {TRAINERS.map((trainer) => (
          <Card key={trainer.name}>
            <CardContent className="p-6">
              <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">
                Photo pending
              </div>
              <p className="font-semibold">{trainer.name}</p>
              <p className="text-xs font-medium text-primary">{trainer.role}</p>
              <p className="mt-3 text-sm text-muted-foreground">{trainer.bio}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

const PACKAGES = [
  { key: "DAY1", label: "Day 1 only", base: "₹23,940", incl: "₹28,250", small: "USD 252", button: "Reserve Day 1", best: false },
  { key: "BOTH", label: "Day 1 + Day 2", base: "₹47,025", incl: "₹55,490", small: "USD 495 · save ₹3,420", button: "Reserve both days", best: true },
  { key: "DAY2", label: "Day 2 only", base: "₹26,505", incl: "₹31,275", small: "USD 279 · for Day 1 graduates only", button: "Reserve Day 2", best: false },
] as const;

export function Pricing() {
  return (
    <section id="fees" className="mx-auto max-w-5xl px-6 py-20">
      <h2 className="text-center text-3xl font-bold tracking-tight">Fees</h2>
      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {PACKAGES.map((pkg) => (
          <Card key={pkg.key} className={pkg.best ? "border-primary shadow-lg" : ""}>
            <CardContent className="p-6">
              {pkg.best ? <Badge className="mb-3">Best value</Badge> : null}
              <p className="font-semibold">{pkg.label}</p>
              <p className="mt-3 text-sm text-muted-foreground line-through">{pkg.base}</p>
              <p className="text-3xl font-bold">{pkg.incl}</p>
              <p className="text-xs text-muted-foreground">{pkg.small}</p>
              <Button asChild className="mt-5 w-full">
                <a href={`?package=${pkg.key}#register`}>{pkg.button}</a>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Fees cover the full-day training, lunch and refreshments. This friends-and-family round is
        priced well below our usual corporate rates.
      </p>
      <dl className="mx-auto mt-8 max-w-md space-y-2 text-sm text-muted-foreground">
        <div><strong>Dates:</strong> Thu 26 Nov and Fri 27 Nov 2026</div>
        <div><strong>Time:</strong> 9:15 am - 5:30 pm (reporting at 8:45 am)</div>
        <div><strong>Venue:</strong> to be confirmed (likely Four Points by Sheraton, Velachery, Chennai)</div>
        <div><strong>Seats:</strong> limited, confirmed on a first-paid basis</div>
      </dl>
    </section>
  );
}

export function WhatToBring() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-20">
      <h2 className="text-center text-3xl font-bold tracking-tight">Before you come</h2>
      <table className="mt-8 w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="py-2"> </th>
            <th className="py-2">Day 1</th>
            <th className="py-2">Day 2</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-border">
            <td className="py-3">Laptop (no iPads)</td>
            <td className="py-3">Required</td>
            <td className="py-3">Required</td>
          </tr>
          <tr className="border-b border-border">
            <td className="py-3">ChatGPT Business or Claude Pro</td>
            <td className="py-3">Required, at least one</td>
            <td className="py-3"></td>
          </tr>
          <tr className="border-b border-border">
            <td className="py-3">Claude Pro and ChatGPT Business</td>
            <td className="py-3"></td>
            <td className="py-3">Required, both</td>
          </tr>
          <tr>
            <td className="py-3">Microsoft Copilot Studio</td>
            <td className="py-3"></td>
            <td className="py-3">Good to have. Without it, you can follow the workflows in demo mode.</td>
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
    <section id="faq" className="mx-auto max-w-3xl px-6 py-20">
      <h2 className="text-center text-3xl font-bold tracking-tight">FAQ</h2>
      <div className="mt-8 space-y-2">
        {FAQS.map((item) => (
          <details key={item.q} className="rounded-lg border border-border p-4">
            <summary className="cursor-pointer text-sm font-medium">{item.q}</summary>
            <p className="mt-2 text-sm text-muted-foreground">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function WorkshopFooter() {
  return (
    <footer className="border-t border-border px-6 py-10 text-center text-sm text-muted-foreground">
      <p className="font-semibold text-foreground">X Intelligence · xintelligence.in</p>
      <p className="mt-1">Contact: [PHONE / WHATSAPP] · [EMAIL]</p>
      <p className="mt-1">Day 1 certification in partnership with the Vjal Institute</p>
      <p className="mt-4">© 2026 X Intelligence</p>
    </footer>
  );
}
