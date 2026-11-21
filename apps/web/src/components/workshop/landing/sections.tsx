"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AnimatePresence,
  animate,
  motion,
  useInView,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
  type Variants,
} from "motion/react";
import {
  AppWindow,
  ArrowDown,
  Bot,
  ChartColumn,
  Images,
  MessageSquareText,
  RotateCw,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  WORKSHOP_PACKAGE_BASE_FEE_INR,
  WORKSHOP_PACKAGE_PRICING_INR,
  WORKSHOP_PACKAGE_PRICING_USD,
  type WorkshopPackageKey,
} from "@/lib/workshop/pricing";

// One easing curve for the whole page: a long, decelerating settle reads
// as deliberate rather than playful.
const EASE = [0.22, 1, 0.36, 1] as const;

// 12px on phones (legible at arm's length), the tighter 11px from sm up.
const EYEBROW = "font-mono text-xs font-medium uppercase tracking-[0.12em] sm:text-[11px] sm:tracking-[0.18em]";
const HEADING = "font-extrabold tracking-[-0.035em] leading-[1.02] [text-wrap:balance]";

// Deep-blue band gradient. Kept to the brand ramp (brand-900 → brand-500)
// so the bands read as the product's blue, not a new colour.
const BAND_GRADIENT = "bg-[linear-gradient(165deg,#0a1640_0%,#14307f_45%,#1d4ed8_100%)]";

const inr = (amount: number) => `₹${amount.toLocaleString("en-IN")}`;

// Scroll-triggered fade/rise, skipped entirely for reduced motion.
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
    visible: { opacity: 1, y: 0, transition: { duration: 0.8, delay, ease: EASE } },
  };

  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-8% 0px -8% 0px" }}
      variants={variants}
    >
      {children}
    </motion.div>
  );
}

// ─── Blue band: gradient, parallax orbs, living dot grid ───────────────

// The white dot grid from the login page, made to breathe: each dot grows
// and fades on a slow diagonal wave, like a "thinking" indicator. Only
// animates while on screen; a still grid for reduced motion.
function DotField({ className = "" }: { className?: string }) {
  const baseRef = React.useRef<HTMLCanvasElement>(null);
  const hoverRef = React.useRef<HTMLCanvasElement>(null);
  const reduceMotion = useReducedMotion();

  React.useEffect(() => {
    const base = baseRef.current;
    const hover = hoverRef.current;
    const ctx = base?.getContext("2d");
    const hoverCtx = hover?.getContext("2d");
    if (!base || !hover || !ctx || !hoverCtx) return;

    const GAP = 24;
    const REACH = 140; // px around the cursor that responds
    let width = 0;
    let height = 0;
    let frame = 0;

    // Eased toward the real pointer each frame so the swell glides
    // instead of snapping, and fades in/out as the cursor enters/leaves.
    const pointer = { x: 0, y: 0, targetX: 0, targetY: 0, strength: 0, targetStrength: 0 };

    const waveAt = (x: number, y: number, time: number) =>
      reduceMotion ? 0.35 : 0.5 + 0.5 * Math.sin(time / 700 - (x * 0.6 + y) / 110);

    const draw = (time: number) => {
      pointer.x += (pointer.targetX - pointer.x) * 0.18;
      pointer.y += (pointer.targetY - pointer.y) * 0.18;
      pointer.strength += (pointer.targetStrength - pointer.strength) * 0.1;

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#ffffff";
      const hovering = pointer.strength >= 0.01;
      for (let y = GAP / 2; y < height; y += GAP) {
        for (let x = GAP / 2; x < width; x += GAP) {
          const wave = waveAt(x, y, time);
          ctx.globalAlpha = 0.14 + wave * 0.36;
          ctx.beginPath();
          ctx.arc(x, y, 0.7 + wave * 1.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // The hover layer is unmasked, so dots answer the cursor even in the
      // quiet middle of a band. Only the cells within reach are visited.
      hoverCtx.clearRect(0, 0, width, height);
      if (!hovering) return;
      hoverCtx.fillStyle = "#ffffff";
      const firstX = Math.max(GAP / 2, Math.floor((pointer.x - REACH) / GAP) * GAP + GAP / 2);
      const firstY = Math.max(GAP / 2, Math.floor((pointer.y - REACH) / GAP) * GAP + GAP / 2);
      for (let y = firstY; y <= Math.min(height, pointer.y + REACH); y += GAP) {
        for (let x = firstX; x <= Math.min(width, pointer.x + REACH); x += GAP) {
          const dx = pointer.x - x;
          const dy = pointer.y - y;
          const distance = Math.hypot(dx, dy);
          if (distance >= REACH) continue;
          const pull = (1 - distance / REACH) ** 2 * pointer.strength;
          const wave = waveAt(x, y, time);
          // Each dot leans a few px toward the cursor and swells.
          // Drawn over the resting dot: it fades in with closeness (no seam
          // at the edge of reach, even where the base layer is masked out)
          // and leans less than it grows, so it always covers the original.
          const lean = distance > 0 ? (pull * 2.5) / distance : 0;
          hoverCtx.globalAlpha = Math.min(1, pull * 0.95);
          hoverCtx.beginPath();
          hoverCtx.arc(x + dx * lean, y + dy * lean, 0.7 + wave * 1.4 + pull * 3.2, 0, Math.PI * 2);
          hoverCtx.fill();
        }
      }
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = base.clientWidth;
      height = base.clientHeight;
      for (const [canvas, context] of [
        [base, ctx],
        [hover, hoverCtx],
      ] as const) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      draw(performance.now());
    };

    const loop = (time: number) => {
      draw(time);
      frame = requestAnimationFrame(loop);
    };

    // The canvases ignore pointer events (content above stays clickable),
    // so the cursor is read from the window and mapped into this band.
    const onPointerMove = (event: PointerEvent) => {
      const rect = base.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
      if (inside && pointer.strength < 0.01) {
        pointer.x = x;
        pointer.y = y;
      }
      pointer.targetX = x;
      pointer.targetY = y;
      pointer.targetStrength = inside ? 1 : 0;
    };
    const onPointerLeave = () => {
      pointer.targetStrength = 0;
    };

    const visibility = new IntersectionObserver(([entry]) => {
      cancelAnimationFrame(frame);
      if (entry?.isIntersecting && !reduceMotion) frame = requestAnimationFrame(loop);
    });
    const sizing = new ResizeObserver(resize);
    visibility.observe(base);
    sizing.observe(base);
    if (!reduceMotion) {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      document.documentElement.addEventListener("pointerleave", onPointerLeave);
    }
    resize();

    return () => {
      cancelAnimationFrame(frame);
      visibility.disconnect();
      sizing.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [reduceMotion]);

  return (
    <>
      <canvas ref={baseRef} aria-hidden="true" className={`pointer-events-none absolute inset-0 h-full w-full ${className}`} />
      <canvas ref={hoverRef} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />
    </>
  );
}

// overflow-clip (not hidden) so sticky children inside a band still pin.
export function BlueBand({
  id,
  children,
  className = "",
  innerClassName = "",
  as: Tag = "section",
}: {
  id?: string;
  children: React.ReactNode;
  className?: string;
  innerClassName?: string;
  as?: "section" | "footer";
}) {
  const ref = React.useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const drift = [
    useTransform(scrollYProgress, [0, 1], [-140, 140]),
    useTransform(scrollYProgress, [0, 1], [120, -180]),
    useTransform(scrollYProgress, [0, 1], [-60, 90]),
  ];
  const orb = (index: number) => (reduceMotion ? undefined : { y: drift[index] });

  return (
    <Tag
      ref={ref as React.Ref<HTMLElement & HTMLDivElement>}
      id={id}
      className={`relative mx-2 scroll-mt-24 overflow-clip rounded-[28px] text-white sm:mx-3 sm:rounded-[36px] ${BAND_GRADIENT} ${className}`}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <motion.div style={orb(0)} className="absolute -left-40 -top-48 size-[38rem] rounded-full bg-brand-500/60 blur-[120px]" />
        <motion.div style={orb(1)} className="absolute -right-40 top-1/4 size-[32rem] rounded-full bg-indigo-500/45 blur-[120px]" />
        <motion.div style={orb(2)} className="absolute -bottom-56 left-1/4 size-[30rem] rounded-full bg-sky-400/30 blur-[120px]" />
        <DotField className="[mask-image:radial-gradient(ellipse_70%_65%_at_50%_45%,transparent_30%,black_70%,transparent_100%)]" />
      </div>
      <div className={`relative ${innerClassName}`}>{children}</div>
    </Tag>
  );
}

function Section({ id, children, className = "" }: { id?: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={`relative scroll-mt-24 px-5 py-24 sm:px-8 sm:py-32 ${className}`}>
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  );
}

export function SectionHeader({
  label,
  title,
  children,
  center = false,
  onBlue = false,
}: {
  label: string;
  title: React.ReactNode;
  children?: React.ReactNode;
  center?: boolean;
  onBlue?: boolean;
}) {
  return (
    <Reveal className={`max-w-3xl ${center ? "mx-auto text-center" : ""}`}>
      <p className={`${EYEBROW} ${onBlue ? "text-sky-300" : "text-primary"}`}>{label}</p>
      <h2
        className={`${HEADING} mt-5 text-[clamp(2.25rem,5vw,4rem)] ${onBlue ? "text-white" : "text-slate-950"}`}
      >
        {title}
      </h2>
      {children ? (
        <p className={`mt-6 text-base leading-relaxed sm:text-lg ${onBlue ? "text-white/75" : "text-slate-600"}`}>{children}</p>
      ) : null}
    </Reveal>
  );
}

// ─── 0. Top bar ────────────────────────────────────────────────────────

const NAV_LINKS = [
  { href: "#program", label: "Program" },
  { href: "#curriculum", label: "Curriculum" },
  { href: "#trainers", label: "Trainers" },
  { href: "#fees", label: "Fees" },
  { href: "#faq", label: "FAQ" },
];

export function WorkshopNav() {
  return (
    <header className="fixed inset-x-0 top-4 z-50 px-4 sm:top-6 sm:px-6">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between rounded-full border border-white/40 bg-white/80 pl-2 pr-2 shadow-[0_10px_40px_-12px_rgba(10,22,64,0.35)] backdrop-blur-xl">
        <a href="#top" className="flex min-h-11 items-center gap-2.5 pl-1 text-[15px] font-extrabold tracking-tight text-slate-950">
          <span
            aria-hidden="true"
            className={`inline-flex size-9 items-center justify-center rounded-full text-[12px] font-extrabold text-white ${BAND_GRADIENT}`}
          >
            XI
          </span>
          X Intelligence
        </a>
        <nav aria-label="Sections" className="hidden items-center gap-7 text-sm font-semibold text-slate-600 md:flex">
          {NAV_LINKS.map((link) => (
            <a key={link.label} href={link.href} className="transition-colors duration-200 hover:text-primary">
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-1 sm:gap-2">
          {/* The session portal registered participants join from. */}
          <Button asChild variant="ghost" className="h-10 rounded-full px-3 font-semibold text-slate-700 sm:px-4">
            <Link href="/login">Log in</Link>
          </Button>
          <Button asChild className="h-10 rounded-full px-5 font-semibold">
            <a href="#register">Register</a>
          </Button>
        </div>
      </div>
    </header>
  );
}

// ─── 1. Hero ───────────────────────────────────────────────────────────

function HandUnderline() {
  const reduceMotion = useReducedMotion();
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 300 24"
      preserveAspectRatio="none"
      className="absolute -bottom-[0.3em] left-0 h-[0.3em] w-full overflow-visible text-sky-300"
    >
      {["M4 16 C 70 6, 170 4, 296 12", "M14 21 C 90 13, 190 12, 290 18"].map((d, index) => (
        <motion.path
          key={d}
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth={index === 0 ? 3.5 : 2}
          strokeLinecap="round"
          opacity={index === 0 ? 1 : 0.6}
          initial={reduceMotion ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.9, delay: 0.9 + index * 0.25, ease: EASE }}
        />
      ))}
    </svg>
  );
}

const HERO_FACTS = [
  { label: "Hours", value: "9:15 am - 5:30 pm" },
  { label: "Place", value: "Four Points by Sheraton, Chennai" },
  { label: "Credential", value: "Day 1 certification" },
];

export function Hero() {
  const reduceMotion = useReducedMotion();
  const { scrollY } = useScroll();
  // The headline sinks and fades a little slower than the page scrolls.
  const textY = useTransform(scrollY, [0, 700], [0, 140]);
  const textOpacity = useTransform(scrollY, [0, 600], [1, 0.25]);

  const enter = (delay: number) =>
    reduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: 22 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.9, delay, ease: EASE },
        };

  return (
    <BlueBand innerClassName="px-5 pb-14 pt-36 sm:px-8 sm:pb-20 sm:pt-48" className="mt-2 sm:mt-3">
      <div id="top" className="mx-auto max-w-6xl text-center">
        <motion.div style={reduceMotion ? undefined : { y: textY, opacity: textOpacity }}>
          <motion.p
            {...enter(0)}
            className={`${EYEBROW} inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-2 text-white/90 backdrop-blur-sm`}
          >
            Friends &amp; Family Edition · Chennai
          </motion.p>
          <motion.h1 {...enter(0.12)} className={`${HEADING} mt-8 text-[clamp(2.5rem,6.4vw,5.5rem)] text-white`}>
            AI that works for you.
            <br />
            <span className="relative inline-block text-sky-200">
              Not the other way around.
              <HandUnderline />
            </span>
          </motion.h1>
          <motion.p {...enter(0.3)} className="mx-auto mt-10 max-w-2xl text-lg leading-relaxed text-white/75 sm:text-xl">
            A hands-on, 2-day workshop for professionals and business leaders. You learn by doing, on your own
            work, with your own laptop.
          </motion.p>
          <motion.div {...enter(0.42)} className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
            <Button
              asChild
              size="lg"
              className="h-13 rounded-full bg-white px-8 text-[15px] font-bold text-brand-800 shadow-[0_18px_40px_-14px_rgba(147,197,253,0.8)] hover:bg-brand-50"
            >
              <a href="#register">Reserve my seat</a>
            </Button>
            <a
              href="#curriculum"
              className="group inline-flex min-h-11 items-center gap-2 px-2 text-[15px] font-semibold text-white/85 transition-colors hover:text-white"
            >
              See the curriculum
              <ArrowDown className="size-4 transition-transform duration-200 group-hover:translate-y-0.5" />
            </a>
          </motion.div>
        </motion.div>

        <dl className="mx-auto mt-20 grid max-w-4xl grid-cols-1 gap-3 text-left sm:grid-cols-3">
          {HERO_FACTS.map((fact, index) => (
            <motion.div
              key={fact.label}
              {...enter(0.6 + index * 0.08)}
              className="rounded-2xl border border-white/15 bg-white/[0.07] p-4 backdrop-blur-md sm:p-5"
            >
              <dt className={`${EYEBROW} text-white/50`}>{fact.label}</dt>
              <dd className="mt-2 text-[15px] font-semibold text-white">{fact.value}</dd>
            </motion.div>
          ))}
        </dl>
        <motion.p {...enter(1)} className="mt-6 text-sm text-white/60">
          Limited seats. Confirmed on a first-paid basis.
        </motion.p>
      </div>
    </BlueBand>
  );
}

// ─── 2. Why now ────────────────────────────────────────────────────────

const SOURCES = {
  microsoft:
    "https://news.microsoft.com/en-in/92-of-indian-knowledge-workers-use-ai-in-the-workplace-finds-microsoft-and-linkedin-2024-work-trend-index/",
  hbs: "https://www.library.hbs.edu/working-knowledge/humans-vs-machines-untangling-the-tasks-ai-can-and-cant-handle",
  nber: "https://www.nber.org/papers/w31161",
} as const;

type ClippingFigure =
  | { kind: "count"; to: number; prefix?: string; suffix: string }
  | { kind: "text"; text: string };

type Clipping = {
  figure: ClippingFigure;
  line: string;
  source: string;
  href: string;
  tilt: number;
};

// Wording is the brief's, verbatim, so the figures stay accurate.
const CLIPPINGS: Clipping[] = [
  {
    figure: { kind: "count", to: 92, suffix: "%" },
    line: "of knowledge workers in India already use AI at work. The global figure is 75%.",
    source: "Microsoft & LinkedIn Work Trend Index, 2024",
    href: SOURCES.microsoft,
    tilt: -1.4,
  },
  {
    figure: { kind: "count", to: 54, suffix: "%" },
    line: "of Indian leaders worry their company has no plan for AI.",
    source: "Microsoft & LinkedIn Work Trend Index, 2024",
    href: SOURCES.microsoft,
    tilt: 0.9,
  },
  {
    figure: { kind: "text", text: "25% faster, 40% better" },
    line: "BCG consultants using GPT-4 finished tasks 25% faster, with 40% higher quality work.",
    source: "Harvard Business School & BCG study, 2023",
    href: SOURCES.hbs,
    tilt: -0.7,
  },
  {
    figure: { kind: "count", to: 34, prefix: "+", suffix: "%" },
    line: "productivity for newer, less experienced staff using an AI assistant. The average gain was 14%.",
    source: "Stanford & MIT, NBER working paper, 2023",
    href: SOURCES.nber,
    tilt: 1.2,
  },
];

// Server render and no-JS both show the real figure; the count only
// runs once the card is about to scroll into view.
function CountUp({ to, prefix = "", suffix }: { to: number; prefix?: string; suffix: string }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const reduceMotion = useReducedMotion();
  const inView = useInView(ref, { once: true, margin: "0px 0px 15% 0px" });

  React.useEffect(() => {
    const node = ref.current;
    if (!inView || reduceMotion || !node) return;
    const controls = animate(0, to, {
      duration: 1.6,
      ease: EASE,
      onUpdate: (value) => {
        node.textContent = `${prefix}${Math.round(value)}${suffix}`;
      },
    });
    return () => controls.stop();
  }, [inView, reduceMotion, to, prefix, suffix]);

  return (
    <span ref={ref} className="tabular-nums">
      {prefix}
      {to}
      {suffix}
    </span>
  );
}

const PAPER_GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.05'/%3E%3C/svg%3E\")";

function ClippingCard({ clipping, index }: { clipping: Clipping; index: number }) {
  const reduceMotion = useReducedMotion();
  const { figure } = clipping;

  return (
    <motion.article
      className="relative flex h-full flex-col rounded-sm border border-[#e7e2d6] bg-[#fbf9f4] p-6 shadow-[0_1px_0_rgba(15,23,42,0.04),0_22px_44px_-26px_rgba(15,23,42,0.3)] sm:p-7"
      style={{ backgroundImage: PAPER_GRAIN }}
      initial={reduceMotion ? false : { opacity: 0, y: 40, rotate: clipping.tilt * 4 }}
      whileInView={{ opacity: 1, y: 0, rotate: clipping.tilt }}
      whileHover={reduceMotion ? undefined : { rotate: 0, y: -6 }}
      viewport={{ once: true, margin: "-10% 0px -10% 0px" }}
      transition={{ duration: 0.9, delay: index * 0.1, ease: EASE }}
    >
      <p
        className={`${HEADING} text-slate-950 ${
          figure.kind === "count" ? "text-[clamp(3.25rem,5.5vw,4.25rem)] leading-none" : "text-[1.875rem] leading-[1.05]"
        }`}
      >
        {figure.kind === "count" ? <CountUp to={figure.to} prefix={figure.prefix} suffix={figure.suffix} /> : figure.text}
      </p>
      <p className="mt-5 flex-1 text-[15px] leading-relaxed text-slate-700">{clipping.line}</p>
      <a
        href={clipping.href}
        target="_blank"
        rel="noreferrer"
        className="mt-6 border-t border-[#e7e2d6] pt-4 font-mono text-xs uppercase leading-relaxed sm:text-[10.5px] tracking-[0.14em] text-slate-500 underline-offset-4 transition-colors hover:text-primary hover:underline"
      >
        {clipping.source} ↗
      </a>
    </motion.article>
  );
}

function ScrollWord({
  children,
  progress,
  range,
  accent,
}: {
  children: string;
  progress: MotionValue<number>;
  range: [number, number];
  accent: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const opacity = useTransform(progress, range, [0.14, 1]);
  return (
    <>
      <motion.span style={reduceMotion ? undefined : { opacity }} className={accent ? "text-primary" : undefined}>
        {children}
      </motion.span>{" "}
    </>
  );
}

// A statement that lights up word by word as it crosses the screen.
function ScrollStatement({ text, accentFrom }: { text: string; accentFrom: number }) {
  const ref = React.useRef<HTMLParagraphElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 85%", "end 50%"] });
  const words = text.split(" ");

  return (
    <p ref={ref} className={`${HEADING} mx-auto max-w-4xl text-center text-[clamp(1.875rem,4vw,3.25rem)] leading-[1.12] text-slate-950`}>
      {words.map((word, index) => (
        <ScrollWord
          key={`${word}-${index}`}
          progress={scrollYProgress}
          range={[index / words.length, (index + 1) / words.length]}
          accent={index >= accentFrom}
        >
          {word}
        </ScrollWord>
      ))}
    </p>
  );
}

export function WhyNow() {
  return (
    <Section>
      <SectionHeader center label="Why now" title="The numbers are already in." />
      <div className="mt-16 grid grid-cols-1 gap-8 sm:grid-cols-2 xl:grid-cols-4 xl:gap-6">
        {CLIPPINGS.map((clipping, index) => (
          <ClippingCard key={clipping.line} clipping={clipping} index={index} />
        ))}
      </div>
      <div className="mt-28 sm:mt-36">
        <ScrollStatement
          text="Everyone has the tools. Very few know how to use them well. That gap is what these two days close."
          accentFrom={12}
        />
      </div>
    </Section>
  );
}

// ─── 3. Who we are ─────────────────────────────────────────────────────

export function About() {
  return (
    <Section className="pt-8 sm:pt-12">
      <div className="grid gap-12 rounded-[32px] border border-slate-200 bg-gradient-to-br from-brand-50/80 via-white to-white p-8 sm:p-14 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <Reveal>
          <p className={`${EYEBROW} text-primary`}>Who we are</p>
          <h2 className={`${HEADING} mt-5 text-[clamp(2.25rem,4.4vw,3.5rem)] text-slate-950`}>X Intelligence</h2>
          <p className="mt-8 border-l-2 border-primary pl-4 text-[15px] font-semibold leading-relaxed text-slate-950">
            Our lead trainer has trained around 50 organisations in AI empowerment.
          </p>
        </Reveal>
        <Reveal delay={0.12}>
          <p className="text-[clamp(1.25rem,2.1vw,1.625rem)] font-semibold leading-[1.45] text-slate-900">
            We run AI empowerment programs for founders, CXOs and senior leaders. Our focus is the AI mindset, not
            just the tools. Tools change every month. The way you think and work with them is what lasts.
          </p>
          <p className="mt-8 text-[15px] leading-relaxed text-slate-600">
            This edition is a small, specially priced round for friends and family. It runs on the same content as
            our corporate program, adjusted for your kind of work.
          </p>
        </Reveal>
      </div>
    </Section>
  );
}

// ─── 4. The 2-day journey (Infographic 1) ──────────────────────────────

const JOURNEY = [
  {
    stop: "Day 1 · Track 1",
    label: "Me + AI",
    program: "AI Empowerment for Professionals",
    line: "Get fluent. Prompting, assistants, analytics, imaging, bots and agents. From basics to agentic AI.",
  },
  {
    stop: "Day 2 · Track 2",
    label: "Team + AI",
    program: "AI Empowerment for Business Leaders 2.0",
    line: "Go deeper. Claude for real work, analytics on your data, workflows, vibe coding, advanced imaging.",
  },
  {
    stop: "What's next",
    label: "Keep going",
    program: null,
    line: "Ask us about our 10-week coaching program.",
  },
] as const;

const JOURNEY_NOTE = "Day 2 builds on Day 1, so you should already know the Day 1 material.";

function JourneyProgress({ active }: { active: number }) {
  return (
    <div aria-hidden="true" className="flex items-center gap-2">
      {JOURNEY.map((item, index) => (
        <React.Fragment key={item.label}>
          <span
            className={`size-3 shrink-0 rounded-full border-2 transition-colors duration-500 ${
              index <= active ? "border-sky-300 bg-sky-300" : "border-white/30 bg-transparent"
            }`}
          />
          {index < JOURNEY.length - 1 ? (
            <span className="h-px flex-1 bg-white/20">
              <span
                className="block h-full origin-left bg-sky-300 transition-transform duration-700"
                style={{ transform: `scaleX(${index < active ? 1 : 0})` }}
              />
            </span>
          ) : null}
        </React.Fragment>
      ))}
    </div>
  );
}

function JourneyPanel({ index }: { index: number }) {
  const item = JOURNEY[index];
  return (
    <div className="rounded-[28px] border border-white/15 bg-white/[0.07] p-8 shadow-[0_40px_80px_-40px_rgba(2,6,23,0.6)] backdrop-blur-xl sm:p-12">
      <JourneyProgress active={index} />
      <p className={`${EYEBROW} mt-12 text-sky-300`}>{item.stop}</p>
      <p className={`${HEADING} mt-4 text-[clamp(3rem,6vw,5rem)] text-white`}>{item.label}</p>
      {item.program ? <p className="mt-4 text-lg font-semibold text-sky-200">{item.program}</p> : null}
      <p className="mt-6 max-w-md text-lg leading-relaxed text-white/75">{item.line}</p>
    </div>
  );
}

// Pinned on desktop: the topic list stays put while scrolling advances the
// journey stop by stop. Phones get the same content stacked, no pinning.
export function Journey() {
  const pinRef = React.useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: pinRef, offset: ["start start", "end end"] });
  const [active, setActive] = React.useState(0);

  useMotionValueEvent(scrollYProgress, "change", (value) => {
    setActive(Math.min(JOURNEY.length - 1, Math.max(0, Math.floor(value * JOURNEY.length))));
  });

  return (
    <BlueBand id="program" className="mt-4">
      <div ref={pinRef} className="relative hidden lg:block" style={{ height: `${JOURNEY.length * 85 + 30}vh` }}>
        <div className="sticky top-0 flex h-svh items-center px-8 pt-16">
          <div className="mx-auto grid w-full max-w-6xl grid-cols-[0.9fr_1.1fr] items-center gap-16">
            <div>
              <SectionHeader onBlue label="The 2-day journey" title="From you, to your team." />
              <ol className="mt-12 border-l border-white/15">
                {JOURNEY.map((item, index) => (
                  <li key={item.label} className="relative py-3 pl-7">
                    {active === index ? (
                      <motion.span
                        layoutId="journey-active"
                        aria-hidden="true"
                        className="absolute -left-px top-0 h-full w-0.5 bg-sky-300"
                        transition={{ duration: reduceMotion ? 0 : 0.5, ease: EASE }}
                      />
                    ) : null}
                    <span
                      className={`text-xl font-bold transition-colors duration-300 ${
                        active === index ? "text-white" : "text-white/40"
                      }`}
                    >
                      {item.label}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="mt-10 max-w-sm text-sm text-white/60">{JOURNEY_NOTE}</p>
            </div>
            <div aria-live="polite">
              <AnimatePresence mode="wait">
                <motion.div
                  key={active}
                  initial={reduceMotion ? false : { opacity: 0, y: 28 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0, y: -28 }}
                  transition={{ duration: 0.45, ease: EASE }}
                >
                  <JourneyPanel index={active} />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 py-20 sm:px-8 sm:py-28 lg:hidden">
        <SectionHeader onBlue label="The 2-day journey" title="From you, to your team." />
        <div className="mt-12 flex flex-col gap-4">
          {JOURNEY.map((item, index) => (
            <Reveal key={item.label} delay={index * 0.08}>
              <JourneyPanel index={index} />
            </Reveal>
          ))}
        </div>
        <p className="mt-8 text-sm text-white/60">{JOURNEY_NOTE}</p>
      </div>
    </BlueBand>
  );
}

// ─── 5. Curriculum ─────────────────────────────────────────────────────

const CURRICULUM = [
  {
    tab: "Day 1",
    when: "Day 1 · Track 1",
    title: "AI Empowerment for Professionals",
    sub: "From the fundamentals all the way up to agentic AI.",
    modules: [
      ["AI for everyday productivity", "the tools that save you real hours every week"],
      ["Smart prompting", "how to ask so you get usable answers the first time"],
      ["Your own AI assistants", "build and customise assistants for your work"],
      ["Beyond chat", "analytics, imaging, bots and agentic AI, shown through real use cases"],
    ],
  },
  {
    tab: "Day 2",
    when: "Day 2 · Track 2",
    title: "AI Empowerment for Business Leaders 2.0",
    sub: "For Day 1 graduates. More hands-on, more depth.",
    modules: [
      ["Quick recap", "of Day 1"],
      ["Claude, hands-on", "using it for real day-to-day work"],
      ["AI analytics", "on your kind of data"],
      ["AI-enabled workflows", "set them up once and they run with very little effort"],
      ["Vibe coding", "build simple apps and interfaces without writing code yourself"],
      ["Advanced imaging", "professional-quality visuals, concepts and techniques"],
    ],
  },
] as const;

export function Curriculum() {
  const [tab, setTab] = React.useState(0);

  return (
    <Section id="curriculum">
      <SectionHeader center label="Curriculum" title="What we cover" />

      {/* Phones get tabs (per the brief); from lg both days sit side by side. */}
      <div role="tablist" aria-label="Workshop day" className="mx-auto mt-12 flex max-w-xs rounded-full bg-slate-100 p-1 lg:hidden">
        {CURRICULUM.map((day, index) => (
          <button
            key={day.tab}
            type="button"
            role="tab"
            id={`curriculum-tab-${index}`}
            aria-selected={tab === index}
            aria-controls={`curriculum-panel-${index}`}
            onClick={() => setTab(index)}
            className={`flex-1 rounded-full py-2.5 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
              tab === index ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"
            }`}
          >
            {day.tab}
          </button>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:mt-16 lg:grid-cols-2">
        {CURRICULUM.map((day, dayIndex) => (
          <div
            key={day.tab}
            role="tabpanel"
            id={`curriculum-panel-${dayIndex}`}
            aria-labelledby={`curriculum-tab-${dayIndex}`}
            className={tab === dayIndex ? "block" : "hidden lg:block"}
          >
            <Reveal delay={dayIndex * 0.1} className="h-full">
              <article className="relative h-full overflow-hidden rounded-[28px] border border-slate-200 bg-white p-7 shadow-[0_30px_60px_-40px_rgba(15,23,42,0.35)] sm:p-10">
                <div aria-hidden="true" className={`absolute inset-x-0 top-0 h-1 ${BAND_GRADIENT}`} />
                <p className={`${EYEBROW} text-primary`}>{day.when}</p>
                <h3 className="mt-4 text-[1.75rem] font-extrabold leading-[1.1] tracking-[-0.025em] text-slate-950">{day.title}</h3>
                <p className="mt-3 text-[15px] text-slate-500">{day.sub}</p>
                <ol className="mt-8 flex flex-col gap-2">
                  {day.modules.map(([title, body], index) => (
                    <li key={title} className="grid grid-cols-[36px_1fr] gap-3 rounded-2xl px-3 py-3 transition-colors duration-200 hover:bg-brand-50/70">
                      <span className="flex size-8 items-center justify-center rounded-full bg-brand-50 font-mono text-xs font-semibold text-primary sm:text-[11px]">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <p className="pt-1 text-[15px] leading-relaxed text-slate-600">
                        <span className="font-semibold text-slate-950">{title}:</span> {body}
                      </p>
                    </li>
                  ))}
                </ol>
              </article>
            </Reveal>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ─── 6. What you'll walk out with ──────────────────────────────────────

const BUILDS = [
  { day: "Day 1", icon: Bot, text: "A custom AI assistant built for a task you do every week" },
  { day: "Day 1", icon: MessageSquareText, text: "A prompt approach you can reuse for any task" },
  { day: "Day 1", icon: Images, text: "Hands-on time with images, analytics and agents" },
  { day: "Day 2", icon: ChartColumn, text: "A dashboard or analysis made from your own kind of data" },
  { day: "Day 2", icon: Workflow, text: "A working automated workflow" },
  { day: "Day 2", icon: AppWindow, text: "A simple app or interface you built yourself" },
] as const;

export function Builds() {
  return (
    <Section className="pt-0 sm:pt-4">
      <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
        <div className="lg:sticky lg:top-32 lg:self-start">
          <SectionHeader label="What you'll walk out with" title="You don't just watch. You build." />
        </div>
        <Reveal delay={0.1}>
          <ul className="relative overflow-hidden rounded-[32px] border border-slate-200 bg-gradient-to-b from-brand-50 via-white to-white p-3 shadow-[0_40px_80px_-50px_rgba(29,78,216,0.5)] sm:p-4">
            {BUILDS.map((item) => {
              const Icon = item.icon;
              return (
                <li
                  key={item.text}
                  className="group flex items-center gap-5 rounded-[22px] p-4 transition-colors duration-300 hover:bg-white sm:p-5"
                >
                  <span
                    className={`flex size-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-[0_10px_24px_-10px_rgba(29,78,216,0.7)] ${BAND_GRADIENT}`}
                  >
                    <Icon className="size-5" strokeWidth={1.8} />
                  </span>
                  {/* On phones the day sits above the text so the line keeps its width. */}
                  <div className="min-w-0 flex-1">
                    <p className="mb-1 font-mono text-xs font-semibold uppercase tracking-[0.12em] text-primary sm:hidden">
                      {item.day}
                    </p>
                    <p className="text-[16px] font-semibold leading-snug text-slate-950">{item.text}</p>
                  </div>
                  <span className="hidden shrink-0 rounded-full sm:inline bg-white px-3 py-1 font-mono text-xs font-semibold uppercase sm:text-[10.5px] tracking-[0.12em] text-primary ring-1 ring-brand-100">
                    {item.day}
                  </span>
                </li>
              );
            })}
          </ul>
        </Reveal>
      </div>
    </Section>
  );
}

// ─── 7. How each day runs (Infographic 2) ──────────────────────────────

const LOOP = [
  { step: "Learn", line: "see it done, on real examples" },
  { step: "Try", line: "do it on your own laptop" },
  { step: "Build", line: "apply it to your own work" },
] as const;

// Cycles Learn → Try → Build while on screen: the three beats repeat
// every module, which is the point of the infographic.
function LearnTryBuild() {
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-20% 0px" });
  const reduceMotion = useReducedMotion();
  const [active, setActive] = React.useState(0);

  React.useEffect(() => {
    if (!inView || reduceMotion) return;
    const timer = window.setInterval(() => setActive((current) => (current + 1) % LOOP.length), 1800);
    return () => window.clearInterval(timer);
  }, [inView, reduceMotion]);

  const cycling = inView && !reduceMotion;

  return (
    <div ref={ref} className="rounded-[24px] border border-brand-100 bg-white p-4 shadow-[0_24px_50px_-36px_rgba(29,78,216,0.6)] sm:p-5">
      <div className="flex items-center justify-between px-1">
        <p className={`${EYEBROW} text-primary`}>Each module</p>
        <span className="inline-flex items-center gap-2 font-mono text-xs text-slate-500 sm:text-[11px]">
          <motion.span
            className="inline-flex"
            animate={cycling ? { rotate: 360 } : { rotate: 0 }}
            transition={cycling ? { duration: 5.4, repeat: Infinity, ease: "linear" } : { duration: 0 }}
          >
            <RotateCw className="size-3.5" />
          </motion.span>
          repeats
        </span>
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-3">
        {LOOP.map((item, index) => {
          const lit = cycling && active === index;
          return (
            <li
              key={item.step}
              className={`rounded-2xl px-4 py-4 transition-all duration-500 ${
                lit ? `${BAND_GRADIENT} text-white shadow-[0_14px_30px_-14px_rgba(29,78,216,0.9)]` : "bg-slate-50 text-slate-950"
              }`}
            >
              <p className="text-[1.25rem] font-extrabold tracking-[-0.02em]">{item.step}</p>
              <p className={`mt-1 text-sm leading-snug ${lit ? "text-white/80" : "text-slate-500"}`}>{item.line}</p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function DaySchedule() {
  const ref = React.useRef<HTMLOListElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 75%", "end 60%"] });

  const rows: { time: string | null; label: string; loop?: boolean }[] = [
    { time: "8:45 am", label: "Reporting & check-in" },
    { time: "9:15 am", label: "We start", loop: true },
    { time: null, label: "Lunch & refreshments (included)" },
    { time: "5:30 pm", label: "Wrap-up" },
  ];

  return (
    <Section>
      <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
        <div className="lg:sticky lg:top-32 lg:self-start">
          <SectionHeader label="How each day runs" title="A full day. Mostly hands‑on.">
            Bring real work. That&apos;s where the learning sticks.
          </SectionHeader>
        </div>
        <ol ref={ref} className="relative">
          <div aria-hidden="true" className="absolute bottom-3 left-[83px] top-3 w-px bg-slate-200 sm:left-[99px]" />
          <motion.div
            aria-hidden="true"
            className="absolute bottom-3 left-[83px] top-3 w-px origin-top bg-primary sm:left-[99px]"
            style={{ scaleY: reduceMotion ? 1 : scrollYProgress }}
          />
          {rows.map((row) => (
            <li key={row.label} className="relative grid grid-cols-[68px_32px_1fr] items-start py-5 sm:grid-cols-[84px_32px_1fr]">
              <span className="pt-0.5 text-right font-mono text-xs text-slate-500 tabular-nums">{row.time ?? ""}</span>
              <span aria-hidden="true" className="flex justify-center pt-1">
                <span className="relative z-10 size-[11px] rounded-full bg-primary ring-4 ring-white" />
              </span>
              <div className="min-w-0">
                <p className="text-[17px] font-semibold text-slate-950">{row.label}</p>
                {row.loop ? (
                  <div className="mt-5">
                    <LearnTryBuild />
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}

// ─── 8. Who it's for ───────────────────────────────────────────────────

const AUDIENCE = [
  "You run a business or lead a team",
  "You use ChatGPT sometimes, but feel you are only scratching the surface",
  "You want to save hours every week, not just try new apps",
  "You are new to AI and want to start properly (Day 1 starts from the basics)",
  "You are 16 or older",
];

function DrawnCheck({ delay }: { delay: number }) {
  const reduceMotion = useReducedMotion();
  return (
    <span aria-hidden="true" className={`flex size-8 shrink-0 items-center justify-center rounded-full ${BAND_GRADIENT}`}>
      <svg viewBox="0 0 24 24" className="size-4 text-white">
        <motion.path
          d="M5.5 12.5 L10 17 L18.5 7.5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={reduceMotion ? false : { pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true, margin: "-10% 0px" }}
          transition={{ duration: 0.5, delay, ease: EASE }}
        />
      </svg>
    </span>
  );
}

export function Audience() {
  return (
    <Section className="pt-0 sm:pt-4">
      <SectionHeader center label="Who it's for" title="Is this for you?" />
      <ul className="mx-auto mt-14 grid max-w-4xl gap-3 sm:grid-cols-2">
        {AUDIENCE.map((item, index) => (
          <Reveal key={item} delay={index * 0.06} className={index === AUDIENCE.length - 1 ? "sm:col-span-2 sm:mx-auto sm:w-1/2" : ""}>
            <li className="flex h-full items-center gap-4 rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.4)]">
              <DrawnCheck delay={0.2 + index * 0.1} />
              <p className="text-[16px] font-semibold leading-snug text-slate-950">{item}</p>
            </li>
          </Reveal>
        ))}
      </ul>
    </Section>
  );
}

// ─── 9. Trainers ───────────────────────────────────────────────────────

const TRAINERS = [
  {
    name: "Mehul Nanavati",
    photo: "/workshop/trainers/mehul-nanavati.jpg",
    role: "Lead Trainer",
    line: "Former Managing Director, Raj Petro Specialities.",
    bio: "Decades of experience running a large enterprise. He has trained around 50 organisations in AI empowerment.",
  },
  {
    name: "Philip Moses",
    photo: "/workshop/trainers/philip-moses.jpg",
    role: "Trainer",
    line: "Founder & CEO, Belsterns Technologies, a certified OpenAI & Claude Partner.",
    bio: "Leads the hands-on sessions on analytics, workflows and building with AI.",
  },
  {
    name: "Madhan Raj",
    photo: "/workshop/trainers/madhan-raj.jpg",
    role: "Trainer",
    line: "Founder & CEO, The Bot Company, an AI agency.",
    bio: "Leads the sessions on advanced imaging and building apps with AI.",
  },
];

export function Trainers() {
  return (
    <Section id="trainers">
      <SectionHeader center label="Your trainers" title="Who's teaching" />
      <div className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-3">
        {TRAINERS.map((trainer, index) => (
          <Reveal key={trainer.name} delay={index * 0.1}>
            <article className="h-full rounded-[28px] border border-slate-200 bg-white p-3 shadow-[0_30px_60px_-44px_rgba(15,23,42,0.45)]">
              {/* Photos are pre-cropped to 4:5 at matching head size. Phones
                  show them square (kept on the face) so three stacked cards
                  stay a comfortable scroll. */}
              <div className={`relative aspect-square overflow-hidden rounded-[22px] md:aspect-[4/5] ${BAND_GRADIENT}`}>
                <Image
                  src={trainer.photo}
                  alt={`${trainer.name}, ${trainer.role}`}
                  fill
                  sizes="(min-width: 768px) 33vw, 100vw"
                  className="object-cover object-[50%_18%] md:object-center"
                />
                {/* Role label sits low, clear of every face. */}
                <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-950/45 to-transparent" />
                <span className={`${EYEBROW} absolute bottom-4 left-4 rounded-full bg-white/20 px-3 py-1.5 text-white backdrop-blur-sm`}>
                  {trainer.role}
                </span>
              </div>
              <div className="px-4 pb-5 pt-6">
                <h3 className="text-[1.5rem] font-extrabold tracking-[-0.025em] text-slate-950">{trainer.name}</h3>
                <p className="mt-2 text-sm font-semibold text-primary">{trainer.line}</p>
                <p className="mt-3 text-[15px] leading-relaxed text-slate-600">{trainer.bio}</p>
              </div>
            </article>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

// ─── 10. Fees & details ────────────────────────────────────────────────

const PACKAGES: {
  key: WorkshopPackageKey;
  label: string;
  usdNote: string;
  cta: string;
  featured: boolean;
}[] = [
  { key: "DAY1", label: "Day 1 only", usdNote: "", cta: "Reserve Day 1", featured: false },
  { key: "BOTH", label: "Day 1 + Day 2", usdNote: "save USD 36", cta: "Reserve both days", featured: true },
  { key: "DAY2", label: "Day 2 only", usdNote: "for Day 1 graduates only", cta: "Reserve Day 2", featured: false },
];

// Writes the chosen package into the URL so the registration form (which
// reads ?package=) switches to it, then lets the #register anchor scroll.
function selectPackage(pkg: WorkshopPackageKey) {
  window.history.replaceState(null, "", `?package=${pkg}#register`);
}

const DETAILS = [
  { label: "Time", value: "9:15 am - 5:30 pm (reporting at 8:45 am)" },
  { label: "Venue", value: "Four Points by Sheraton, Velachery, Chennai" },
  { label: "Seats", value: "limited, confirmed on a first-paid basis" },
];

function PriceCard({ pkg }: { pkg: (typeof PACKAGES)[number] }) {
  const usd = `USD ${WORKSHOP_PACKAGE_PRICING_USD[pkg.key]}`;
  const onBlue = pkg.featured;

  return (
    <article
      className={`relative flex h-full flex-col overflow-hidden rounded-[28px] p-8 sm:p-10 ${
        onBlue
          ? `${BAND_GRADIENT} text-white shadow-[0_40px_80px_-30px_rgba(29,78,216,0.65)]`
          : "border border-slate-200 bg-white shadow-[0_30px_60px_-44px_rgba(15,23,42,0.4)]"
      }`}
    >
      {onBlue ? (
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-sky-400/40 blur-[80px]" />
      ) : null}
      <div className="relative flex flex-1 flex-col">
        <div className="flex items-center justify-between gap-3">
          <h3 className={`text-[15px] font-semibold ${onBlue ? "text-white" : "text-slate-950"}`}>{pkg.label}</h3>
          {onBlue ? (
            <span className={`${EYEBROW} rounded-full bg-white px-3 py-1.5 text-brand-800`}>Best value</span>
          ) : null}
        </div>
        <p className={`mt-8 text-[3rem] font-extrabold leading-none tracking-[-0.03em] ${onBlue ? "text-white" : "text-slate-950"}`}>
          {inr(WORKSHOP_PACKAGE_PRICING_INR[pkg.key])}
        </p>
        <p className={`mt-3 text-sm ${onBlue ? "text-white/75" : "text-slate-500"}`}>
          {inr(WORKSHOP_PACKAGE_BASE_FEE_INR[pkg.key])} + 18% GST
        </p>
        <p className={`mt-1 font-mono text-xs uppercase tracking-[0.12em] sm:text-[11px] ${onBlue ? "text-sky-200" : "text-slate-400"}`}>
          {pkg.usdNote ? `${usd} · ${pkg.usdNote}` : usd}
        </p>
        <div className="mt-auto pt-10">
          <Button
            asChild
            size="lg"
            variant={onBlue ? "default" : "outline"}
            className={`h-12 w-full rounded-full text-[15px] font-bold ${
              onBlue ? "bg-white text-brand-800 hover:bg-brand-50" : ""
            }`}
          >
            <a href="#register" onClick={() => selectPackage(pkg.key)}>
              {pkg.cta}
            </a>
          </Button>
        </div>
      </div>
    </article>
  );
}

export function Pricing() {
  return (
    <Section id="fees">
      <SectionHeader center label="Fees & details" title="Fees" />
      <div className="mt-16 grid grid-cols-1 items-stretch gap-5 lg:grid-cols-3">
        {PACKAGES.map((pkg, index) => (
          <Reveal key={pkg.key} delay={index * 0.1} className={pkg.featured ? "lg:-my-4" : ""}>
            <PriceCard pkg={pkg} />
          </Reveal>
        ))}
      </div>

      <Reveal className="mt-10 text-center">
        <p className="text-sm text-slate-600">Fees cover the full-day training, lunch and refreshments.</p>
      </Reveal>

      <Reveal delay={0.1} className="mx-auto mt-12 max-w-4xl">
        <dl className="grid overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50/60 sm:grid-cols-3">
          {DETAILS.map((detail) => (
            <div key={detail.label} className="border-b border-slate-200 p-6 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
              <dt className={`${EYEBROW} text-slate-400`}>{detail.label}</dt>
              <dd className="mt-2 text-[15px] text-slate-950">{detail.value}</dd>
            </div>
          ))}
        </dl>
      </Reveal>
    </Section>
  );
}

// ─── 11. What to bring ─────────────────────────────────────────────────

const BRING: { item: React.ReactNode; day1: string | null; day2: string | null }[] = [
  { item: "Laptop (no iPads)", day1: "Required", day2: "Required" },
  {
    item: (
      <>
        ChatGPT Business <strong>or</strong> Claude Pro
      </>
    ),
    day1: "Required, at least one",
    day2: null,
  },
  {
    item: (
      <>
        Claude Pro <strong>and</strong> ChatGPT Business
      </>
    ),
    day1: null,
    day2: "Required, both",
  },
  {
    item: "Microsoft Copilot Studio",
    day1: null,
    day2: "Good to have. Without it, you can follow the workflows in demo mode.",
  },
];

function BringCell({ day, value }: { day: string; value: string | null }) {
  return (
    <div className="flex gap-3 text-[15px] sm:block">
      <span className={`${EYEBROW} w-14 shrink-0 pt-0.5 text-slate-400 sm:hidden`}>{day}</span>
      {value ? (
        <span className="text-slate-950">{value}</span>
      ) : (
        <span className="text-slate-300">
          <span aria-hidden="true">·</span>
          <span className="sr-only">Not needed</span>
        </span>
      )}
    </div>
  );
}

export function WhatToBring() {
  return (
    <Section className="pt-0 sm:pt-4">
      <SectionHeader center label="What to bring" title="Before you come" />
      <Reveal className="mx-auto mt-14 max-w-4xl">
        <div role="table" aria-label="What to bring each day" className="overflow-hidden rounded-[24px] border border-slate-200 bg-white">
          <div role="row" className="hidden grid-cols-[1.3fr_1fr_1fr] gap-6 border-b border-slate-200 bg-slate-50 px-6 py-4 sm:grid">
            <span role="columnheader" className={`${EYEBROW} text-slate-400`}>Item</span>
            <span role="columnheader" className={`${EYEBROW} text-slate-400`}>Day 1</span>
            <span role="columnheader" className={`${EYEBROW} text-slate-400`}>Day 2</span>
          </div>
          {BRING.map((row, index) => (
            <div
              key={index}
              role="row"
              className="grid gap-3 border-b border-slate-200 px-6 py-6 last:border-b-0 sm:grid-cols-[1.3fr_1fr_1fr] sm:gap-6"
            >
              <span role="rowheader" className="text-[16px] font-semibold text-slate-950 [&_strong]:text-primary">
                {row.item}
              </span>
              <span role="cell">
                <BringCell day="Day 1" value={row.day1} />
              </span>
              <span role="cell">
                <BringCell day="Day 2" value={row.day2} />
              </span>
            </div>
          ))}
        </div>
      </Reveal>
    </Section>
  );
}

// ─── 12. FAQ ───────────────────────────────────────────────────────────

// `null` marks an answer the brief still lists as to be confirmed.
const CANCELLATION_POLICY = (
  <div className="flex flex-col gap-4">
    <div>
      <p className="font-semibold text-slate-950">Cancellations</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>15 days or more before the workshop: full refund, less 3% towards bank and admin charges.</li>
        <li>7 to 14 days before: 50% refund, less charges.</li>
        <li>Less than 7 days before, or no-show: no refund.</li>
      </ul>
    </div>
    <p>
      <span className="font-semibold text-slate-950">Packages.</span> If you cancel one day of a multi-day package, the
      day you keep is charged at its single-day fee. The balance is refunded under the timelines above.
    </p>
    <p>
      <span className="font-semibold text-slate-950">Substitution.</span> You can send someone in your place at no extra
      cost if you tell us at least 1 day before. They must meet the workshop criteria.
    </p>
    <p>
      <span className="font-semibold text-slate-950">Changes by us.</span> If we cancel or reschedule, you can choose a
      full refund or a seat on the new date.
    </p>
    <p>To cancel or substitute, please reach out to the organiser.</p>
  </div>
);

const FAQS: { q: string; a: React.ReactNode | null }[] = [
  { q: "I'm new to AI. Is Day 1 too advanced?", a: "No. Day 1 starts from the fundamentals and builds up step by step." },
  { q: "Can I attend only Day 2?", a: "Only if you have done our Day 1 before. If you haven't, take both days." },
  { q: "Do I get a certificate?", a: "Yes. Day 1 is a certification program." },
  {
    q: "Do I really need the paid subscriptions?",
    a: "Yes. The sessions are hands-on, and free plans cut off the features we use. Please set them up before the day.",
  },
  { q: "Is food included?", a: "Yes, lunch and refreshments on both days." },
  { q: "Can I bring my spouse or a colleague?", a: "Yes. Each person registers separately. Minimum age is 16." },
  { q: "What if I can't make it after paying?", a: CANCELLATION_POLICY },
  { q: "Will I get a GST invoice?", a: "Yes. Add your company and GSTIN details in the form." },
];

export function Faq() {
  return (
    <Section id="faq" className="pt-0 sm:pt-4">
      <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <div className="lg:sticky lg:top-32 lg:self-start">
          <SectionHeader label="FAQ" title="Questions" />
        </div>
        <Reveal delay={0.1} className="flex flex-col gap-3">
          {FAQS.map((item) => (
            <details
              key={item.q}
              className="group rounded-[22px] border border-slate-200 bg-white px-6 transition-shadow duration-300 open:shadow-[0_24px_50px_-36px_rgba(29,78,216,0.55)]"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[17px] font-semibold text-slate-950 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 [&::-webkit-details-marker]:hidden">
                {item.q}
                <span
                  aria-hidden="true"
                  className="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-primary before:absolute before:h-px before:w-3 before:bg-current after:absolute after:h-3 after:w-px after:bg-current after:transition-transform after:duration-300 group-open:after:scale-y-0"
                />
              </summary>
              {/* A div, not a p: some answers hold lists and paragraphs of their own. */}
              <div className="max-w-2xl pb-6 text-[15px] leading-relaxed text-slate-600">
                {item.a ?? <span className="italic text-slate-400">To be confirmed.</span>}
              </div>
            </details>
          ))}
        </Reveal>
      </div>
    </Section>
  );
}

// ─── 14. Footer ────────────────────────────────────────────────────────

export function WorkshopFooter() {
  return (
    <BlueBand as="footer" className="mb-2 mt-4 sm:mb-3" innerClassName="px-5 py-16 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <p className={`${HEADING} text-[clamp(2.75rem,8vw,6rem)] text-white`}>X Intelligence</p>
        <div className="mt-14 flex flex-col gap-4 border-t border-white/15 pt-8 text-sm text-white/70 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-semibold text-white">thexintelligence.ai</p>
          <p>© 2026 X Intelligence</p>
        </div>
      </div>
    </BlueBand>
  );
}
