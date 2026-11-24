"use client";
import * as React from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { EnhancePanel } from "@/components/prompt-bot/enhance-panel";
import { MatrixPanel } from "@/components/prompt-bot/matrix-panel";
import { useActiveQuestion, useMatrixAnswers } from "@/components/prompt-bot/use-matrix-answers";
import { unansweredQuestionIds } from "@/lib/prompt-bot/scoring";
import { patchSession, readEnhanceStream, saveAnswer, scoreSession } from "@/lib/prompt-bot/client";
import type { SessionView } from "@/lib/prompt-bot/sessions";

export function Workspace({ initial, taskMatrices }: { initial: SessionView; taskMatrices: { id: string; name: string }[] }) {
  const [view, setView] = React.useState(initial);
  const [basePrompt, setBasePrompt] = React.useState(initial.basePrompt);
  const matrix = useMatrixAnswers({
    initialAnswers: initial.answers,
    initialRevision: initial.scoreRevision,
    saveAnswer: (questionId, patch) => saveAnswer(view.id, questionId, patch),
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
  const [enhanceError, setEnhanceError] = React.useState<string | null>(null);

  const questions = view.matrices.flatMap((m) => m.questions);
  const gaps = unansweredQuestionIds(questions.map((q) => matrix.answerFor(q.id)));

  function updateBasePrompt(value: string) {
    matrix.bumpRevision();
    setBasePrompt(value);
    if (!value.trim()) return;
    matrix.queueSave("basePrompt", async () => {
      const saved = await patchSession(view.id, { basePrompt: value });
      if (!saved.ok) toast.error(saved.message);
      matrix.scheduleScore();
    });
  }

  async function switchTask(taskMatrixId: string | null) {
    await matrix.flushSaves();
    const result = await patchSession(view.id, { taskMatrixId });
    if (!result.ok) return toast.error(result.message);
    matrix.bumpRevision();
    setView(result.data);
    matrix.mergeAnswers(result.data.answers);
    matrix.scheduleScore();
  }

  async function enhance() {
    if (gaps.length > 0 && !window.confirm(`${gaps.length} questions not answered yet — the enhanced prompt will be higher-level. Continue?`)) return;
    setStreaming(true);
    setEnhanceError(null);
    setEnhanced("");
    await matrix.flushSaves();
    let streamed = "";
    const restore = () => {
      setEnhanced(lastGood.current.content);
      setVersion(lastGood.current.version);
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
      setStreaming(false);
    }
  }

  function selectVersion(next: number) {
    const entry = history.find((h) => h.version === next);
    if (!entry || streaming) return;
    lastGood.current = { content: entry.content, version: entry.version };
    setEnhanced(entry.content);
    setVersion(entry.version);
  }

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
  const task = view.matrices.find((m) => m.kind === "TASK") ?? null;
  const groups = view.matrices.map((m) => ({ id: m.id, title: m.kind === "CORE" ? "Core" : m.name, questions: m.questions }));

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <MatrixPanel
        heading="Design Think"
        groups={groups}
        answerFor={matrix.answerFor}
        activeId={activeId}
        scoreState={matrix.scoreState}
        onSelect={selectQuestion}
        onToggleRelevant={(id) => matrix.updateAnswer(id, { notRelevant: !matrix.answerFor(id).notRelevant })}
      >
        <label className="mt-5 flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Task type</span>
          <span className="relative">
            <select
              value={task?.id ?? ""}
              onChange={(e) => void switchTask(e.target.value || null)}
              className="appearance-none rounded-xl border border-border bg-white/60 py-1.5 pl-3 pr-8 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 dark:bg-white/5"
            >
              <option value="">Core only</option>
              {taskMatrices.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-2 size-4 text-muted-foreground" aria-hidden />
          </span>
        </label>
      </MatrixPanel>

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
                placeholder={active.guidance}
                className="mt-2 min-h-24 bg-white/60 dark:bg-white/5"
              />
            </div>
          )}
        </section>
        <EnhancePanel
          content={enhanced}
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
