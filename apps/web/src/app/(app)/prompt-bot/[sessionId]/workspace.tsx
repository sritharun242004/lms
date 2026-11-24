"use client";
import * as React from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { QuestionRow } from "@/components/prompt-bot/question-row";
import { ReadinessMeter } from "@/components/prompt-bot/readiness-meter";
import { EnhancePanel } from "@/components/prompt-bot/enhance-panel";
import { readiness, unansweredQuestionIds } from "@/lib/prompt-bot/scoring";
import { debounce, patchSession, readEnhanceStream, saveAnswer, scoreSession } from "@/lib/prompt-bot/client";
import type { AnswerView, SessionView } from "@/lib/prompt-bot/sessions";

const SAVE_DELAY_MS = 600;
const SCORE_DELAY_MS = 1500;

export function Workspace({ initial, taskMatrices }: { initial: SessionView; taskMatrices: { id: string; name: string }[] }) {
  const [view, setView] = React.useState(initial);
  const [answers, setAnswers] = React.useState<Record<string, AnswerView>>(() =>
    Object.fromEntries(initial.answers.map((a) => [a.questionId, a])),
  );
  const [basePrompt, setBasePrompt] = React.useState(initial.basePrompt);
  const [activeId, setActiveId] = React.useState<string | null>(initial.matrices[0]?.questions[0]?.id ?? null);
  const [scoreState, setScoreState] = React.useState<"idle" | "scoring" | "failed">("idle");
  const [enhanced, setEnhanced] = React.useState(initial.latestEnhancement?.content ?? "");
  const [version, setVersion] = React.useState<number | null>(initial.latestEnhancement?.version ?? null);
  const [streaming, setStreaming] = React.useState(false);
  const [enhanceError, setEnhanceError] = React.useState<string | null>(null);
  const revision = React.useRef(initial.scoreRevision);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const questions = view.matrices.flatMap((m) => m.questions);
  const answerFor = (id: string): AnswerView => answers[id] ?? { questionId: id, answer: "", score: 0, reason: null, notRelevant: false };
  const list = questions.map((q) => answerFor(q.id));
  const ready = readiness(list);
  const gaps = unansweredQuestionIds(list);

  const scheduleScore = React.useCallback(() => {
    revision.current += 1;
    const mine = revision.current;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setScoreState("scoring");
      const result = await scoreSession(view.id, mine);
      if (!result.ok) {
        setScoreState("failed");
        if (result.code === "LIMIT_REACHED") toast.error(result.message);
        return;
      }
      setScoreState("idle");
      if (result.data.applied && mine === revision.current) {
        setAnswers((prev) => {
          const next = { ...prev };
          for (const a of result.data.answers) next[a.questionId] = { ...a, answer: prev[a.questionId]?.answer ?? a.answer };
          return next;
        });
      }
    }, SCORE_DELAY_MS);
  }, [view.id]);

  // Per-field debounced network saves. State updates stay immediate; `pending` holds the latest
  // save per field so it can also be flushed early (before enhance / task switch / unmount).
  const pending = React.useRef(new Map<string, () => Promise<void>>());
  const inflight = React.useRef(new Set<Promise<void>>());
  const debouncers = React.useRef(new Map<string, (key: string) => void>());

  const runPending = React.useCallback((key: string) => {
    const run = pending.current.get(key);
    if (!run) return;
    pending.current.delete(key);
    const p = run().finally(() => inflight.current.delete(p));
    inflight.current.add(p);
  }, []);

  const queueSave = React.useCallback(
    (key: string, run: () => Promise<void>) => {
      pending.current.set(key, run);
      let d = debouncers.current.get(key);
      if (!d) {
        d = debounce(runPending, SAVE_DELAY_MS);
        debouncers.current.set(key, d);
      }
      d(key);
    },
    [runPending],
  );

  const flushSaves = React.useCallback(async () => {
    for (const key of [...pending.current.keys()]) runPending(key);
    await Promise.all([...inflight.current]);
  }, [runPending]);

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      for (const key of [...pending.current.keys()]) runPending(key);
    },
    [runPending],
  );

  function updateAnswer(questionId: string, patch: Partial<Pick<AnswerView, "answer" | "notRelevant">>) {
    setAnswers((prev) => ({ ...prev, [questionId]: { ...(prev[questionId] ?? answerFor(questionId)), ...patch } }));
    const field = "answer" in patch ? "answer" : "notRelevant";
    queueSave(`answer:${questionId}:${field}`, async () => {
      const saved = await saveAnswer(view.id, questionId, patch);
      if (!saved.ok) toast.error(saved.message);
      scheduleScore();
    });
  }

  function updateBasePrompt(value: string) {
    setBasePrompt(value);
    if (!value.trim()) return;
    queueSave("basePrompt", async () => {
      const saved = await patchSession(view.id, { basePrompt: value });
      if (!saved.ok) toast.error(saved.message);
      scheduleScore();
    });
  }

  async function switchTask(taskMatrixId: string | null) {
    await flushSaves();
    const result = await patchSession(view.id, { taskMatrixId });
    if (!result.ok) return toast.error(result.message);
    setView(result.data);
    setAnswers((prev) => ({ ...Object.fromEntries(result.data.answers.map((a) => [a.questionId, a])), ...prev }));
    scheduleScore();
  }

  async function enhance() {
    if (gaps.length > 0 && !window.confirm(`${gaps.length} questions not answered yet — the enhanced prompt will be higher-level. Continue?`)) return;
    setStreaming(true);
    setEnhanceError(null);
    setEnhanced("");
    await flushSaves();
    try {
      const res = await fetch(`/api/v1/prompt-bot/sessions/${view.id}/enhance`, { method: "POST", credentials: "include" });
      const result = await readEnhanceStream(res, (text) => setEnhanced((prev) => prev + text));
      if ("error" in result) {
        setEnhanceError(result.error);
        setEnhanced(initial.latestEnhancement?.content ?? "");
      } else setVersion(result.version);
    } catch {
      setEnhanceError("Couldn't reach the server. Check your connection.");
      setEnhanced(initial.latestEnhancement?.content ?? "");
    } finally {
      setStreaming(false);
    }
  }

  const active = questions.find((q) => q.id === activeId) ?? null;
  const task = view.matrices.find((m) => m.kind === "TASK") ?? null;
  const offsets = view.matrices.map((_, i) => view.matrices.slice(0, i).reduce((sum, m) => sum + m.questions.length, 0));

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <aside className="glass h-fit rounded-[1.75rem] p-5 lg:sticky lg:top-24" aria-labelledby="design-think-heading">
        <h1 id="design-think-heading" className="text-lg font-semibold">Design Think</h1>
        <div className="mt-3">
          <ReadinessMeter {...ready} />
        </div>
        <p className="mt-2 h-4 text-xs text-muted-foreground" aria-live="polite">
          {scoreState === "scoring" ? "Updating…" : scoreState === "failed" ? "Couldn't update the bars — keep typing to retry." : ""}
        </p>
        {view.matrices.map((matrix, mi) => (
          <section key={matrix.id} className="mt-4" aria-labelledby={`matrix-${matrix.id}`}>
            <h2 id={`matrix-${matrix.id}`} className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {matrix.kind === "CORE" ? "Core" : matrix.name}
            </h2>
            <ul className="mt-2 flex flex-col gap-1">
              {matrix.questions.map((q, qi) => {
                const a = answerFor(q.id);
                return (
                  <QuestionRow
                    key={q.id}
                    index={offsets[mi] + qi + 1}
                    text={q.text}
                    score={a.score}
                    reason={a.reason}
                    notRelevant={a.notRelevant}
                    active={q.id === activeId}
                    onSelect={() => setActiveId(q.id)}
                    onToggleRelevant={() => updateAnswer(q.id, { notRelevant: !a.notRelevant })}
                  />
                );
              })}
            </ul>
          </section>
        ))}
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
      </aside>

      <div className="flex min-w-0 flex-col gap-5">
        <section className="glass rounded-[1.75rem] p-5">
          <label htmlFor="base-prompt" className="text-sm font-medium">Your prompt</label>
          <Textarea id="base-prompt" value={basePrompt} onChange={(e) => updateBasePrompt(e.target.value)} className="mt-2 min-h-28 bg-white/60 dark:bg-white/5" />
          {active && (
            <div className="mt-5">
              <label htmlFor="answer" className="text-sm font-medium">{active.text}</label>
              <Textarea
                id="answer"
                value={answerFor(active.id).answer}
                onChange={(e) => updateAnswer(active.id, { answer: e.target.value })}
                placeholder={active.guidance}
                className="mt-2 min-h-24 bg-white/60 dark:bg-white/5"
              />
            </div>
          )}
        </section>
        <EnhancePanel content={enhanced} streaming={streaming} version={version} error={enhanceError} onEnhance={() => void enhance()} unansweredCount={gaps.length} />
      </div>
    </div>
  );
}
