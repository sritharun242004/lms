"use client";
import * as React from "react";
import { toast } from "sonner";
import { debounce, type CallResult, type ScoreReply } from "@/lib/prompt-bot/client";
import type { AnswerView } from "@/lib/prompt-bot/sessions";

export const SAVE_DELAY_MS = 600;
export const SCORE_DELAY_MS = 1500;

export type AnswerPatch = Partial<Pick<AnswerView, "answer" | "notRelevant">>;
export type ScoreState = "idle" | "scoring" | "failed";

export const emptyAnswer = (questionId: string): AnswerView => ({ questionId, answer: "", score: 0, reason: null, notRelevant: false });

type Options = {
  initialAnswers: AnswerView[];
  initialRevision: number;
  saveAnswer(questionId: string, patch: AnswerPatch): Promise<CallResult<unknown>>;
  score(revision: number): Promise<CallResult<ScoreReply>>;
};

/**
 * Answer state for a question matrix, shared by the Prompt Bot workspace and the Skills Builder.
 * Edits update state at once. Saves are debounced per field and run one after another, so a slow
 * earlier save can't land last. Scoring is debounced; the revision is bumped on every edit and a
 * score reply is applied only if no edit happened after it was requested.
 */
export function useMatrixAnswers({ initialAnswers, initialRevision, saveAnswer, score }: Options) {
  const [answers, setAnswers] = React.useState<Record<string, AnswerView>>(() =>
    Object.fromEntries(initialAnswers.map((a) => [a.questionId, a])),
  );
  const [scoreState, setScoreState] = React.useState<ScoreState>("idle");
  const calls = React.useRef({ saveAnswer, score });
  React.useEffect(() => {
    calls.current = { saveAnswer, score };
  });
  const revision = React.useRef(initialRevision);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = React.useRef(new Map<string, () => Promise<void>>());
  const tails = React.useRef(new Map<string, Promise<void>>());
  const debouncers = React.useRef(new Map<string, (key: string) => void>());

  const scheduleScore = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const sent = revision.current;
      setScoreState("scoring");
      const result = await calls.current.score(sent);
      if (!result.ok) {
        setScoreState("failed");
        if (result.code === "LIMIT_REACHED") toast.error(result.message);
        return;
      }
      setScoreState("idle");
      if (result.data.applied && sent === revision.current) {
        setAnswers((prev) => {
          const next = { ...prev };
          for (const a of result.data.answers) {
            const local = prev[a.questionId];
            next[a.questionId] = local ? { ...local, score: a.score, reason: a.reason } : a;
          }
          return next;
        });
      }
    }, SCORE_DELAY_MS);
  }, []);

  const bumpRevision = React.useCallback(() => {
    revision.current += 1;
  }, []);

  const runPending = React.useCallback((key: string) => {
    const run = pending.current.get(key);
    if (!run) return;
    pending.current.delete(key);
    const tail = (tails.current.get(key) ?? Promise.resolve()).then(run);
    tails.current.set(key, tail);
    void tail.finally(() => {
      if (tails.current.get(key) === tail) tails.current.delete(key);
    });
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
    await Promise.all([...tails.current.values()]);
  }, [runPending]);

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      for (const key of [...pending.current.keys()]) runPending(key);
    },
    [runPending],
  );

  const answerFor = React.useCallback((id: string): AnswerView => answers[id] ?? emptyAnswer(id), [answers]);

  const updateAnswer = React.useCallback(
    (questionId: string, patch: AnswerPatch) => {
      bumpRevision();
      setAnswers((prev) => ({ ...prev, [questionId]: { ...(prev[questionId] ?? emptyAnswer(questionId)), ...patch } }));
      const field = "answer" in patch ? "answer" : "notRelevant";
      queueSave(`answer:${questionId}:${field}`, async () => {
        const saved = await calls.current.saveAnswer(questionId, patch);
        if (!saved.ok) toast.error(saved.message);
        scheduleScore();
      });
    },
    [bumpRevision, queueSave, scheduleScore],
  );

  const mergeAnswers = React.useCallback((incoming: AnswerView[]) => {
    setAnswers((prev) => ({ ...Object.fromEntries(incoming.map((a) => [a.questionId, a])), ...prev }));
  }, []);

  return { answers, answerFor, scoreState, updateAnswer, mergeAnswers, queueSave, flushSaves, bumpRevision, scheduleScore };
}

/** Which question's answer box is open. Clicking a row focuses the box; mounting does not. */
export function useActiveQuestion(initialId: string | null) {
  const [activeId, setActiveId] = React.useState<string | null>(initialId);
  const answerRef = React.useRef<HTMLTextAreaElement>(null);
  const focusAnswer = React.useRef(false);

  React.useEffect(() => {
    if (focusAnswer.current) {
      focusAnswer.current = false;
      answerRef.current?.focus();
    }
  }, [activeId]);

  function selectQuestion(id: string) {
    if (id === activeId) answerRef.current?.focus();
    else {
      focusAnswer.current = true;
      setActiveId(id);
    }
  }

  return { activeId, answerRef, selectQuestion };
}
