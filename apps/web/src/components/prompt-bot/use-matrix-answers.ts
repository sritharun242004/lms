"use client";
import * as React from "react";
import { toast } from "sonner";
import { debounce, type CallResult, type SaveOptions, type ScoreReply } from "@/lib/prompt-bot/client";
import type { AnswerView } from "@/lib/prompt-bot/sessions";

export const SAVE_DELAY_MS = 600;

export type AnswerPatch = Partial<Pick<AnswerView, "answer" | "notRelevant">>;
export type CheckError = { code: string; message: string };
/** What the scorer last saw of an answer. */
type Checked = Pick<AnswerView, "answer" | "notRelevant">;

export const emptyAnswer = (questionId: string): AnswerView => ({ questionId, answer: "", score: 0, reason: null, notRelevant: false });

const snapshot = (answers: Record<string, AnswerView>): Record<string, Checked> =>
  Object.fromEntries(Object.values(answers).map((a) => [a.questionId, { answer: a.answer, notRelevant: a.notRelevant }]));

/** A relevant answer whose text or relevance differs from what was last checked. */
function differs(a: AnswerView, seen: Checked | undefined): boolean {
  if (a.notRelevant) return false;
  return a.answer !== (seen?.answer ?? "") || (seen?.notRelevant ?? false);
}

type Options = {
  initialAnswers: AnswerView[];
  initialRevision: number;
  saveAnswer(questionId: string, patch: AnswerPatch, options: SaveOptions): Promise<CallResult<unknown>>;
  /** Null when there is nothing to score with (no AI key): edits still save, and checking is not offered. */
  score: ((revision: number) => Promise<CallResult<ScoreReply>>) | null;
};

/**
 * Answer state for a question matrix, shared by the Prompt Bot workspace and the Skills Builder.
 * Edits update state at once. Saves are debounced per field and run one after another, so a slow
 * earlier save can't land last.
 *
 * Scoring runs only when asked (`check`): it sends pending saves first, so the server scores the
 * latest text, then scores every question. Each check sends a higher revision; a reply older than
 * one already applied is ignored. An answer counts as changed until a check sees its current text;
 * `markStale` flags every answer when what they are scored against (the prompt, description or
 * files) changes.
 *
 * Pending saves are never dropped: they are sent when the owner unmounts (navigating inside the app)
 * and, as keepalive requests, when the page is hidden or unloaded. While a save is pending or in
 * flight, closing or reloading the page asks for confirmation first.
 */
export function useMatrixAnswers({ initialAnswers, initialRevision, saveAnswer, score }: Options) {
  const [answers, setAnswers] = React.useState<Record<string, AnswerView>>(() =>
    Object.fromEntries(initialAnswers.map((a) => [a.questionId, a])),
  );
  const [checked, setChecked] = React.useState<Record<string, Checked>>(() => snapshot(answers));
  const [inFlight, setInFlight] = React.useState(0);
  const [checkError, setCheckError] = React.useState<CheckError | null>(null);
  /** Bumped by `markStale`; equal to `checkedMark` once a check has seen the change. */
  const [staleMark, setStaleMark] = React.useState(0);
  const [checkedMark, setCheckedMark] = React.useState(0);
  const calls = React.useRef({ saveAnswer, score });
  const latestAnswers = React.useRef(answers);
  React.useEffect(() => {
    calls.current = { saveAnswer, score };
    latestAnswers.current = answers;
  });
  const stale = React.useRef(0);
  const revision = React.useRef(initialRevision);
  /** The newest check whose reply was applied; older replies are dropped. */
  const applied = React.useRef(-1);
  /** Set by the first edit; after that, server data never replaces local state. */
  const edited = React.useRef(false);
  const pending = React.useRef(new Map<string, (options: SaveOptions) => Promise<void>>());
  const tails = React.useRef(new Map<string, Promise<void>>());
  const debouncers = React.useRef(new Map<string, (key: string) => void>());

  const markStale = React.useCallback(() => {
    edited.current = true;
    stale.current += 1;
    setStaleMark(stale.current);
  }, []);


  /**
   * Swaps in fresher saved answers (the page can mount from a cached first load, e.g. after browser
   * Back). Ignored once the user has edited anything, so typing is never overwritten.
   */
  const replaceAnswers = React.useCallback((incoming: AnswerView[], nextRevision: number): boolean => {
    if (edited.current) return false;
    revision.current = nextRevision;
    const next = Object.fromEntries(incoming.map((a) => [a.questionId, a]));
    setAnswers(next);
    setChecked(snapshot(next));
    return true;
  }, []);

  const runPending = React.useCallback((key: string, options: SaveOptions = {}) => {
    const run = pending.current.get(key);
    if (!run) return;
    pending.current.delete(key);
    const tail = (tails.current.get(key) ?? Promise.resolve()).then(() => run(options));
    tails.current.set(key, tail);
    void tail.finally(() => {
      if (tails.current.get(key) === tail) tails.current.delete(key);
    });
  }, []);

  const queueSave = React.useCallback(
    (key: string, run: (options: SaveOptions) => Promise<void>) => {
      pending.current.set(key, run);
      let d = debouncers.current.get(key);
      if (!d) {
        d = debounce((k: string) => runPending(k), SAVE_DELAY_MS);
        debouncers.current.set(key, d);
      }
      d(key);
    },
    [runPending],
  );

  /** Starts every pending save now (their debounce timers then find nothing to send). */
  const sendPending = React.useCallback(
    (options: SaveOptions = {}) => {
      for (const key of [...pending.current.keys()]) runPending(key, options);
    },
    [runPending],
  );

  const flushSaves = React.useCallback(async () => {
    sendPending();
    await Promise.all([...tails.current.values()]);
  }, [sendPending]);

  const check = React.useCallback(async () => {
    if (!calls.current.score) return;
    setInFlight((n) => n + 1);
    setCheckError(null);
    try {
      await flushSaves();
      const score = calls.current.score;
      if (!score) return;
      revision.current += 1;
      const sent = revision.current;
      const seen = snapshot(latestAnswers.current);
      const mark = stale.current;
      const result = await score(sent);
      if (sent < applied.current) return;
      if (!result.ok) return setCheckError({ code: result.code, message: result.message });
      // Not applied means another tab checked with a newer revision; the next check goes above it.
      if (!result.data.applied) {
        revision.current = Math.max(revision.current, result.data.revision);
        return;
      }
      applied.current = sent;
      setAnswers((prev) => {
        const next = { ...prev };
        for (const a of result.data.answers) {
          const local = prev[a.questionId];
          next[a.questionId] = local ? { ...local, score: a.score, reason: a.reason } : a;
        }
        return next;
      });
      setChecked((prev) => ({ ...prev, ...seen }));
      setCheckedMark((m) => Math.max(m, mark));
    } finally {
      setInFlight((n) => n - 1);
    }
  }, [flushSaves]);

  React.useEffect(() => {
    // Keepalive lets the request finish after the page is gone (tab closed, reload, app switch on mobile).
    const leaving = () => sendPending({ keepalive: true });
    const onVisibility = () => {
      if (document.visibilityState === "hidden") leaving();
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (pending.current.size === 0 && tails.current.size === 0) return;
      leaving();
      event.preventDefault();
      // Older browsers show the prompt only when returnValue is set.
      event.returnValue = "";
    };
    window.addEventListener("pagehide", leaving);
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", leaving);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibility);
      // Unmounting means navigating inside the app: the page stays alive, so ordinary requests finish.
      sendPending();
    };
  }, [sendPending]);

  const answerFor = React.useCallback((id: string): AnswerView => answers[id] ?? emptyAnswer(id), [answers]);

  const updateAnswer = React.useCallback(
    (questionId: string, patch: AnswerPatch) => {
      edited.current = true;
      setAnswers((prev) => ({ ...prev, [questionId]: { ...(prev[questionId] ?? emptyAnswer(questionId)), ...patch } }));
      const field = "answer" in patch ? "answer" : "notRelevant";
      queueSave(`answer:${questionId}:${field}`, async (options) => {
        const saved = await calls.current.saveAnswer(questionId, patch, options);
        if (!saved.ok) toast.error(saved.message);
      });
    },
    [queueSave],
  );

  const isChanged = React.useCallback((id: string) => differs(answers[id] ?? emptyAnswer(id), checked[id]), [answers, checked]);
  const pendingCount = Object.values(answers).filter((a) => differs(a, checked[a.questionId])).length;

  return {
    answers,
    answerFor,
    updateAnswer,
    replaceAnswers,
    queueSave,
    flushSaves,
    canCheck: score !== null,
    checking: inFlight > 0,
    checkError,
    check,
    isChanged,
    pendingCount,
    contextStale: staleMark !== checkedMark,
    markStale,
  };
}

export type MatrixAnswers = ReturnType<typeof useMatrixAnswers>;

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
