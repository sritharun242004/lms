"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTheme } from "next-themes";
import type { WordCloudEntryResult } from "@/lib/api/services/message-service";
import { useWordCloudLayout } from "@/hooks/use-word-cloud-layout";
import { hslForHue } from "@/lib/word-cloud/color";
import {
  WORD_CLOUD_MAX_FONT_SIZE,
  WORD_CLOUD_MIN_FONT_SIZE,
} from "@/lib/word-cloud/layout";
import { cn } from "@/lib/utils";

function useContainerSize<T extends HTMLElement>() {
  const ref = React.useRef<T>(null);
  const [size, setSize] = React.useState({ width: 0, height: 0 });

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, size };
}

/** Replays a brief rise, burst, and settle whenever a word's count changes. */
function PopcornBurst({
  pulseKey,
  reduceMotion,
  children,
}: {
  pulseKey: string;
  reduceMotion: boolean;
  children: React.ReactNode;
}) {
  if (reduceMotion) return <tspan>{children}</tspan>;

  return (
    <motion.tspan
      key={pulseKey}
      initial={{ opacity: 0.72, scale: 0.88, y: 6 }}
      animate={{
        opacity: [0.72, 1, 1, 1],
        scale: [0.88, 1.48, 0.96, 1],
        y: [6, -8, 2, 0],
      }}
      transition={{
        duration: 0.46,
        times: [0, 0.32, 0.7, 1],
        ease: [0.16, 1, 0.3, 1],
      }}
      style={{ transformBox: "fill-box", transformOrigin: "center" }}
    >
      {children}
    </motion.tspan>
  );
}

export function WordCloudCanvas({
  entries,
  className,
}: {
  entries: WordCloudEntryResult[];
  className?: string;
}) {
  const { ref, size } = useContainerSize<HTMLDivElement>();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const reduceMotion = useReducedMotion();

  const words = React.useMemo(
    () => entries.map((e) => ({ id: e.id, text: e.text, count: e.count })),
    [entries]
  );

  const responsiveMaxFontSize = Math.min(
    WORD_CLOUD_MAX_FONT_SIZE,
    Math.max(148, Math.round(size.width * 0.42))
  );

  const placed = useWordCloudLayout(words, {
    width: size.width,
    height: size.height,
    minFontSize: WORD_CLOUD_MIN_FONT_SIZE,
    maxFontSize: responsiveMaxFontSize,
  });

  const colorById = React.useMemo(
    () => new Map(entries.map((e) => [e.id, hslForHue(Number(e.color), isDark)])),
    [entries, isDark]
  );

  return (
    <div
      ref={ref}
      className={cn("relative min-h-[220px] w-full flex-1 overflow-hidden", className)}
    >
      {entries.length === 0 ? (
        <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          Words will appear here as people submit them.
        </p>
      ) : size.width > 0 && size.height > 0 ? (
        <svg
          viewBox={`0 0 ${size.width} ${size.height}`}
          width={size.width}
          height={size.height}
          className="block"
          role="img"
          aria-label="Live word cloud"
        >
          <AnimatePresence mode="popLayout">
            {placed.map((word) => (
              <motion.text
                key={word.id}
                initial={reduceMotion ? false : { opacity: 0, scale: 0.9, x: word.x, y: word.y }}
                animate={{
                  opacity: 1,
                  scale: 1,
                  x: word.x,
                  y: word.y,
                  rotate: word.rotation,
                }}
                exit={reduceMotion ? undefined : { opacity: 0, scale: 0.96 }}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 210, damping: 24, mass: 0.8 }
                }
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={word.fontSize}
                fontWeight={600}
                fill={colorById.get(word.id)}
                style={{ transformBox: "fill-box", transformOrigin: "center", cursor: "default" }}
              >
                <title>
                  {word.text} · {word.count} {word.count === 1 ? "mention" : "mentions"}
                </title>
                <PopcornBurst
                  pulseKey={`${word.id}:${word.count}`}
                  reduceMotion={Boolean(reduceMotion)}
                >
                  {word.text}
                </PopcornBurst>
              </motion.text>
            ))}
          </AnimatePresence>
        </svg>
      ) : null}
    </div>
  );
}
