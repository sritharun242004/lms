"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { useTheme } from "next-themes";
import type { WordCloudEntryResult } from "@/lib/api/services/message-service";
import { useWordCloudLayout } from "@/hooks/use-word-cloud-layout";
import { hslForHue } from "@/lib/word-cloud/color";
import { cn } from "@/lib/utils";

const MIN_FONT_SIZE = 24;
const MAX_FONT_SIZE = 74;

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

/** Replays a brief grow-and-settle pulse whenever `pulseKey` changes. */
function Pulse({ pulseKey, children }: { pulseKey: string; children: React.ReactNode }) {
  return (
    <motion.tspan
      key={pulseKey}
      initial={{ scale: 1 }}
      animate={{ scale: [1, 1.22, 1] }}
      transition={{ duration: 0.45, ease: "easeOut" }}
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

  const words = React.useMemo(
    () => entries.map((e) => ({ id: e.id, text: e.text, count: e.count })),
    [entries]
  );

  const placed = useWordCloudLayout(words, {
    width: size.width,
    height: size.height,
    minFontSize: MIN_FONT_SIZE,
    maxFontSize: MAX_FONT_SIZE,
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
                initial={{ opacity: 0, scale: 0, x: word.x, y: word.y }}
                animate={{
                  opacity: 1,
                  scale: 1,
                  x: word.x,
                  y: word.y,
                  fontSize: `${word.fontSize}px`,
                  rotate: word.rotation,
                }}
                exit={{ opacity: 0, scale: 0 }}
                transition={{ type: "spring", stiffness: 170, damping: 20 }}
                textAnchor="middle"
                dominantBaseline="middle"
                fontWeight={600}
                fill={colorById.get(word.id)}
                style={{ transformBox: "fill-box", transformOrigin: "center", cursor: "default" }}
              >
                <title>
                  {word.text} · {word.count} {word.count === 1 ? "mention" : "mentions"}
                </title>
                <Pulse pulseKey={`${word.id}:${word.count}`}>{word.text}</Pulse>
              </motion.text>
            ))}
          </AnimatePresence>
        </svg>
      ) : null}
    </div>
  );
}
