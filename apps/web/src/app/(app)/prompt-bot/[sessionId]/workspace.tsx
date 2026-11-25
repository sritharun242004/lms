"use client";
import * as React from "react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { AnswerCheck, checkOnShortcut } from "@/components/prompt-bot/answer-check";
import { EnhancePanel } from "@/components/prompt-bot/enhance-panel";
import { MatrixPanel } from "@/components/prompt-bot/matrix-panel";
import { useActiveQuestion, useMatrixAnswers } from "@/components/prompt-bot/use-matrix-answers";
import { unansweredQuestionIds } from "@/lib/prompt-bot/scoring";
import { getSession, patchSession, readEnhanceStream, saveAnswer, scoreSession } from "@/lib/prompt-bot/client";
import type { SessionView } from "@/lib/prompt-bot/sessions";

export function Workspace({ initial }: { initial: SessionView }) {
  const view = initial;
  const [basePrompt, setBasePrompt] = React.useState(initial.basePrompt);
  const matrix = useMatrixAnswers({
    initialAnswers: initial.answers,
    initialRevision: initial.scoreRevision,
    saveAnswer: (questionId, patch, options) => saveAnswer(view.id, questionId, patch, options),
    score: (revision) => scoreSession(view.id, revision),
  });
  const { activeId, answerRef, selectQuestion } = useActiveQuestion(initial.matrices[0]?.questions[0]?.id ?? null);
  const [enhanced, setEnhanced] = React.useState(initial.latestEnhancement?.content ?? "");
  const [version, setVersion] = React.useState<number | null>(initial.latestEnhancement?.version ?? null);
  const [history, setHistory] = React.useState<{ version: number; content: string }[]>(() =>
    initial.latestEnhancement ? [{ version: initial.latestEnhancement.version, content: initial.latestEnhancement.content }] : [],
  );
  const lastGood = React.useRef<{ content: string; version: number | null }>({
    content: initial.latestEnhancement?.content ?? "",
    version: initial.latestEnhancement?.version ?? null,
  });
  const [streaming, setStreaming] = React.useState(false);
  /** Bumped whenever a different prompt replaces the shown one, so the panel fades it in. */
  const [contentKey, setContentKey] = React.useState(0);
  const showNext = () => setContentKey((k) => k + 1);
  const enhancing = React.useRef(false);
  const [enhanceError, setEnhanceError] = React.useState<string | null>(null);

  const questions = view.matrices.flatMap((m) => m.questions);
  const gaps = unansweredQuestionIds(questions.map((q) => matrix.answerFor(q.id)));

  // A new prompt changes what every answer is scored against: the bars are flagged for "Check all".
  function updateBasePrompt(value: string) {
    matrix.markStale();
    setBasePrompt(value);
    if (!value.trim()) return;
    matrix.queueSave("basePrompt", async (options) => {
      const saved = await patchSession(view.id, { basePrompt: value }, options);
      if (!saved.ok) toast.error(saved.message);
    });
  }

  async function enhance() {
    const unchecked = matrix.pendingCount > 0 || matrix.contextStale;
    if (
      gaps.length > 0 &&
      !window.confirm(
        `${gaps.length} questions aren't fully answered yet${unchecked ? " (some changes haven't been checked)" : ""}. The enhanced prompt will ask the AI to check them with you first. Continue?`,
      )
    )
      return;
    enhancing.current = true;
    setStreaming(true);
    setEnhanceError(null);
    setEnhanced("");
    showNext();
    await matrix.flushSaves();
    let streamed = "";
    const restore = () => {
      setEnhanced(lastGood.current.content);
      setVersion(lastGood.current.version);
      showNext();
    };
    try {
      const res = await fetch(`/api/v1/prompt-bot/sessions/${view.id}/enhance`, { method: "POST", credentials: "include" });
      const result = await readEnhanceStream(res, (text) => {
        streamed += text;
        setEnhanced((prev) => prev + text);
      });
      if ("error" in result) {
        setEnhanceError(result.error);
        restore();
      } else {
        lastGood.current = { content: streamed, version: result.version };
        setVersion(result.version);
        setHistory((prev) => [{ version: result.version, content: streamed }, ...prev.filter((h) => h.version !== result.version)]);
      }
    } catch {
      setEnhanceError("Couldn't reach the server. Check your connection.");
      restore();
    } finally {
      enhancing.current = false;
      setStreaming(false);
    }
  }

  function selectVersion(next: number) {
    const entry = history.find((h) => h.version === next);
    if (!entry || streaming) return;
    lastGood.current = { content: entry.content, version: entry.version };
    setEnhanced(entry.content);
    setVersion(entry.version);
    showNext();
  }

  // Browser Back re-mounts this page from the router's cached first load, so read the saved session
  // once and use it if the user hasn't started editing.
  const { replaceAnswers } = matrix;
  React.useEffect(() => {
    let cancelled = false;
    void getSession(initial.id).then((fresh) => {
      if (cancelled || !fresh.ok || !Array.isArray(fresh.data?.answers)) return;
      if (!replaceAnswers(fresh.data.answers, fresh.data.scoreRevision)) return;
      setBasePrompt(fresh.data.basePrompt);
      const latest = fresh.data.latestEnhancement;
      if (latest && !enhancing.current && latest.version > (lastGood.current.version ?? 0)) {
        lastGood.current = { content: latest.content, version: latest.version };
        setEnhanced(latest.content);
        setVersion(latest.version);
        showNext();
        setHistory((prev) => [{ version: latest.version, content: latest.content }, ...prev.filter((h) => h.version !== latest.version)]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [initial.id, replaceAnswers]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/v1/prompt-bot/sessions/${initial.id}/enhancements`, { credentials: "include" });
        const body = await res.json().catch(() => null);
        if (cancelled || !res.ok || !body?.success || !Array.isArray(body.data)) return;
        const loaded = (body.data as { version: number; content: string }[]).map((e) => ({ version: e.version, content: e.content }));
        setHistory((prev) => {
          const seen = new Set(prev.map((h) => h.version));
          return [...prev, ...loaded.filter((e) => !seen.has(e.version))].sort((x, y) => y.version - x.version);
        });
      } catch {
        // The switcher is a convenience; the latest version is already shown.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initial.id]);

  const active = questions.find((q) => q.id === activeId) ?? null;
  // The last core question (by order) reads "Finally: …", as on the Design Think deck.
  const groups = view.matrices.map((m) => ({ id: m.id, title: m.name, questions: m.questions, closingLead: "Finally" }));

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <MatrixPanel
        heading="Design Think"
        groups={groups}
        state={matrix}
        activeId={activeId}
        onSelect={selectQuestion}
      />

      <div className="flex min-w-0 flex-col gap-5">
        <section className="glass rounded-[1.75rem] p-5">
          <label htmlFor="base-prompt" className="text-sm font-medium">Your prompt</label>
          <Textarea id="base-prompt" value={basePrompt} onChange={(e) => updateBasePrompt(e.target.value)} className="mt-2 min-h-28 bg-white/60 dark:bg-white/5" />
          {active && (
            <div className="mt-5">
              <label htmlFor="answer" className="text-sm font-medium">{active.text}</label>
              <Textarea
                id="answer"
                ref={answerRef}
                value={matrix.answerFor(active.id).answer}
                onChange={(e) => matrix.updateAnswer(active.id, { answer: e.target.value })}
                onKeyDown={checkOnShortcut(matrix, active.id)}
                placeholder={active.guidance}
                className="mt-2 min-h-24 bg-white/60 dark:bg-white/5"
              />
              <AnswerCheck key={active.id} state={matrix} questionId={active.id} question={active.text} />
            </div>
          )}
        </section>
        <EnhancePanel
          content={enhanced}
          contentKey={contentKey}
          streaming={streaming}
          version={version}
          versions={history.map((h) => h.version)}
          onSelectVersion={selectVersion}
          error={enhanceError}
          onEnhance={() => void enhance()}
          unansweredCount={gaps.length}
        />
        <p className="text-center text-xs text-muted-foreground">
          Your prompts are stored in the LMS and sent to Anthropic&apos;s API to analyse them.
        </p>
      </div>
    </div>
  );
}
