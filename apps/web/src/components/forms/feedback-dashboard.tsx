"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import type { CallbacksProp, Word } from "@cp949/react-wordcloud";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { hslForHue, hueForWord } from "@/lib/word-cloud/color";
import { createWordcloudOptions, toWordcloudWords } from "@/lib/word-cloud/react-wordcloud";

const ReactWordcloud = dynamic(
  () => import("@cp949/react-wordcloud").then(({ ReactWordcloud }) => ReactWordcloud),
  { ssr: false, loading: () => <div className="min-h-[220px] w-full" aria-hidden="true" /> }
);

type FeedbackAggregate = {
  targetType: string;
  targetLabel: string;
  responseCount: number;
  averagesByQuestion: { questionId: string; questionTitle: string; average: number }[];
};

type WordCloudEntry = { word: string; count: number; responseIds: string[] };
type DrilldownAnswer = { responseId: string; questionTitle: string; text: string };

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const result = await response.json();
  if (!result.success) throw new Error(result.error?.message ?? "Request failed");
  return result.data as T;
}

export function FeedbackDashboard() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const [aggregates, setAggregates] = React.useState<FeedbackAggregate[]>([]);
  const [entries, setEntries] = React.useState<WordCloudEntry[]>([]);
  const [drilldown, setDrilldown] = React.useState<{ word: string; answers: DrilldownAnswer[] } | null>(null);

  React.useEffect(() => {
    fetchJson<{ aggregates: FeedbackAggregate[] }>("/api/v1/feedback").then((data) => setAggregates(data.aggregates));
    fetchJson<{ entries: WordCloudEntry[] }>("/api/v1/feedback/word-cloud").then((data) => setEntries(data.entries));
  }, []);

  const words = React.useMemo(
    () =>
      entries.map((e) => ({
        id: e.word,
        text: e.word,
        count: e.count,
        color: String(hueForWord(e.word)),
      })),
    [entries]
  );
  const wordcloudWords = React.useMemo(() => toWordcloudWords(words), [words]);
  const options = React.useMemo(() => createWordcloudOptions(600, false), []);

  const callbacks = React.useMemo<CallbacksProp>(
    () => ({
      getWordColor: (word) => hslForHue(Number((word as unknown as { color: string }).color), isDark),
      onWordClick: async (word) => {
        const entry = entries.find((e) => e.word === (word as unknown as { text: string }).text);
        if (!entry) return;
        const data = await fetchJson<{ answers: DrilldownAnswer[] }>(
          `/api/v1/feedback/word-cloud/responses?ids=${entry.responseIds.join(",")}`
        );
        setDrilldown({ word: entry.word, answers: data.answers });
      },
    }),
    [entries, isDark]
  );

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <p className="mb-2 text-xs font-semibold tracking-[.14em] text-primary uppercase">Feedback</p>
        <h1 className="text-3xl font-bold tracking-tight">Feedback dashboard</h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {aggregates.map((aggregate) => (
          <Card key={`${aggregate.targetType}-${aggregate.targetLabel}`}>
            <CardContent className="p-5">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{aggregate.targetType}</Badge>
                <p className="font-semibold">{aggregate.targetLabel}</p>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{aggregate.responseCount} response(s)</p>
              {aggregate.averagesByQuestion.map((q) => (
                <p key={q.questionId} className="mt-2 text-sm">
                  {q.questionTitle}: <span className="font-semibold">{q.average.toFixed(1)}</span>
                </p>
              ))}
            </CardContent>
          </Card>
        ))}
        {aggregates.length === 0 ? <p className="text-sm text-muted-foreground">No feedback forms with responses yet.</p> : null}
      </div>

      <Card>
        <CardContent className="p-6">
          <h2 className="mb-4 font-semibold">Open-ended feedback word cloud</h2>
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open-ended responses yet.</p>
          ) : (
            <div style={{ height: 320 }}>
              <ReactWordcloud
                words={wordcloudWords as unknown as Word[]}
                options={options}
                callbacks={callbacks}
                size={[600, 320]}
                minSize={[1, 1]}
                maxWords={entries.length}
              />
            </div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Word frequency only — this is not sentiment analysis.
          </p>
        </CardContent>
      </Card>

      {drilldown ? (
        <Card>
          <CardContent className="p-6">
            <h2 className="mb-3 font-semibold">Responses mentioning &quot;{drilldown.word}&quot;</h2>
            <ul className="flex flex-col gap-2">
              {drilldown.answers.map((answer, index) => (
                <li key={index} className="rounded-lg border border-border p-3 text-sm">
                  <p className="text-xs text-muted-foreground">{answer.questionTitle}</p>
                  {answer.text}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
