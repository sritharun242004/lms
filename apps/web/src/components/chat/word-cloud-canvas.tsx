"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useReducedMotion } from "motion/react";
import { useTheme } from "next-themes";
import type { CallbacksProp, Word } from "@cp949/react-wordcloud";
import type { WordCloudEntryResult } from "@/lib/api/services/message-service";
import { hslForHue } from "@/lib/word-cloud/color";
import {
  createWordcloudOptions,
  toWordcloudWords,
  type CmsWordcloudWord,
} from "@/lib/word-cloud/react-wordcloud";
import { cn } from "@/lib/utils";

const ReactWordcloud = dynamic(
  () => import("@cp949/react-wordcloud").then(({ ReactWordcloud }) => ReactWordcloud),
  {
    ssr: false,
    loading: () => <div className="min-h-[220px] w-full" aria-hidden="true" />,
  }
);

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

  const words = React.useMemo(() => toWordcloudWords(entries), [entries]);
  const options = React.useMemo(
    () => createWordcloudOptions(size.width, Boolean(reduceMotion)),
    [reduceMotion, size.width]
  );
  const wordcloudSize = React.useMemo<[number, number]>(
    () => [Math.max(1, Math.round(size.width)), Math.max(1, Math.round(size.height))],
    [size.height, size.width]
  );
  const callbacks = React.useMemo<CallbacksProp>(
    () => ({
      getWordColor: (word) => {
        const cmsWord = word as unknown as CmsWordcloudWord;
        return hslForHue(Number(cmsWord.color), isDark);
      },
      getWordTooltip: (word) => {
        const cmsWord = word as unknown as CmsWordcloudWord;
        return `${cmsWord.text} · ${cmsWord.count} ${cmsWord.count === 1 ? "mention" : "mentions"}`;
      },
    }),
    [isDark]
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
        <div role="img" aria-label="Live word cloud" className="absolute inset-0">
          <ReactWordcloud
            words={words as unknown as Word[]}
            options={options}
            callbacks={callbacks}
            size={wordcloudSize}
            minSize={[1, 1]}
            maxWords={entries.length}
          />
        </div>
      ) : null}
    </div>
  );
}
