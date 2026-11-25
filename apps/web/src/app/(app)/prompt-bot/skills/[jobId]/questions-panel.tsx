"use client";
import * as React from "react";
import { Loader2, Plus, RefreshCw, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, type ConfirmDialogHandle } from "@/components/ui/confirm-dialog";
import { MatrixPanel } from "@/components/prompt-bot/matrix-panel";
import { useActiveQuestion, type MatrixAnswers } from "@/components/prompt-bot/use-matrix-answers";
import { addQuestion, deleteQuestion, generateQuestions, patchQuestion } from "@/lib/skills/jobs/client";
import { descriptionLength, outputTypeHeading, tooShortMessage } from "@/lib/skills/jobs/task-text";
import type { JobFileView, JobView, TaskQuestionView } from "@/lib/skills/jobs/types";
import { JOB_LIMITS } from "@/lib/skills/limits";
import { fixedQuestions, perUseQuestions } from "./job-steps";
import { PerUseList } from "./per-use-list";
import { AnswerCard } from "./question-answer-card";
import { QuestionEditor } from "./question-editor";
import { QuestionFiles } from "./question-files";

const WRITING = "Preparing questions for your task…";
const REGENERATE_TEXT =
  "Questions you added yourself, and answers to questions that come back with the same wording, are kept. Other answers are removed and their files move to General files.";

type EditorInput = Parameters<React.ComponentProps<typeof QuestionEditor>["onSubmit"]>[0];
type Props = {
  job: JobView;
  state: MatrixAnswers;
  aiConfigured: boolean;
  /** The step is on screen: questions are written automatically only then. */
  visible: boolean;
  /** The description as typed (the saved copy may lag behind). */
  description: string;
  flushSaves(): Promise<void>;
  onQuestionsWritten(view: JobView): void;
  onQuestionChange(question: TaskQuestionView): void;
  onQuestionRemoved(questionId: string): void;
  onFileChange(file: JobFileView): void;
  onFileRemoved(fileId: string): void;
};

/**
 * Step 2. "Answer now (same every time)" questions with 3-slice bars beside the selected question's
 * answer and files; under them "Asked each time you use it". Saving and checking stay in the workspace.
 */
export function QuestionsPanel(props: Props) {
  const { job, state, aiConfigured, visible, description, onQuestionChange, onQuestionRemoved, onFileChange, onFileRemoved } = props;
  const fixed = fixedQuestions(job.questions);
  const perUse = perUseQuestions(job.questions);
  const fixedIds = new Set(fixed.map((q) => q.id));
  const generalFiles = job.files.filter((f) => !f.questionId || !fixedIds.has(f.questionId));
  const { activeId, answerRef, selectQuestion } = useActiveQuestion(fixed[0]?.id ?? null);
  const active = fixed.find((q) => q.id === activeId) ?? fixed[0] ?? null;
  const [editor, setEditor] = React.useState<"add" | "edit" | null>(null);
  const returnFocus = React.useRef<HTMLElement | null>(null);
  const confirmRef = React.useRef<ConfirmDialogHandle>(null);
  const shortId = React.useId();
  const length = descriptionLength(description);
  const short = length < JOB_LIMITS.descriptionMinChars;

  const [writing, setWriting] = React.useState(false);
  const [writeError, setWriteError] = React.useState<string | null>(null);
  const latest = React.useRef(props);
  React.useEffect(() => {
    latest.current = props;
  });
  const busy = React.useRef(false);
  const write = React.useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setWriting(true);
    setWriteError(null);
    await latest.current.flushSaves();
    const result = await generateQuestions(latest.current.job.id);
    busy.current = false;
    setWriting(false);
    if (!result.ok) return setWriteError(result.message);
    latest.current.onQuestionsWritten(result.data);
  }, []);

  // First visit to a task with a long enough description and no questions yet writes them, once.
  const autoWrite = visible && aiConfigured && !short && job.questions.length === 0 && job.questionsGeneratedAt === null;
  const autoWritten = React.useRef(false);
  React.useEffect(() => {
    if (!autoWrite) return;
    const timer = setTimeout(() => {
      if (autoWritten.current) return;
      autoWritten.current = true;
      void write();
    }, 0);
    return () => clearTimeout(timer);
  }, [autoWrite, write]);

  async function regenerate() {
    const confirmed = await confirmRef.current?.open({ title: "Write new questions?", description: REGENERATE_TEXT, confirmLabel: "Write new questions" });
    if (confirmed) await write();
  }

  function openEditor(mode: "add" | "edit") {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEditor(mode);
  }
  function closeEditor() {
    setEditor(null);
    const target = returnFocus.current;
    requestAnimationFrame(() => target?.isConnected && target.focus());
  }
  function select(id: string) {
    setEditor(null);
    selectQuestion(id);
  }

  async function saveQuestion(input: EditorInput): Promise<string | null> {
    const adding = editor === "add" || !active;
    const result = adding ? await addQuestion(job.id, { ...input, kind: "FIXED" }) : await patchQuestion(job.id, active.id, input);
    if (!result.ok) return result.message;
    onQuestionChange(result.data);
    setEditor(null);
    if (adding) selectQuestion(result.data.id);
    else requestAnimationFrame(() => answerRef.current?.focus());
    return null;
  }

  async function remove(question: TaskQuestionView) {
    const confirmed = await confirmRef.current?.open({
      title: "Delete this question?",
      description: "Its answer is deleted. Its files move to General files.",
      confirmLabel: "Delete question",
      destructive: true,
    });
    if (!confirmed) return;
    const result = await deleteQuestion(job.id, question.id);
    if (!result.ok) return void toast.error(result.message);
    onQuestionRemoved(question.id);
  }

  const status = (
    <div aria-live="polite">
      {writing && (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 shrink-0 animate-spin text-primary motion-reduce:animate-none" aria-hidden />
          {WRITING}
        </p>
      )}
      {writeError && (
        <p role="alert" className="mt-3 text-sm text-pretty text-destructive">
          {writeError}
        </p>
      )}
    </div>
  );
  const general = generalFiles.length > 0 && (
    <QuestionFiles jobId={job.id} question={null} files={generalFiles} aiConfigured={aiConfigured} onFileChange={onFileChange} onFileRemoved={onFileRemoved} />
  );

  if (job.questions.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <section className="glass mx-auto flex w-full max-w-2xl flex-col items-center gap-3 rounded-[1.75rem] px-5 py-10 text-center" aria-labelledby={`${shortId}-empty`}>
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Wand2 className="size-5" aria-hidden />
          </span>
          <h2 id={`${shortId}-empty`} className="text-lg font-semibold text-balance">
            Let&apos;s learn more about your task
          </h2>
          <p className="max-w-md text-sm text-pretty text-muted-foreground">
            Let&apos;s get to know your task. We&apos;ll ask 5 to 8 questions about what stays the same every time, and list what changes on each run.
          </p>
          <Button
            size="lg"
            className="mt-1 min-h-11"
            disabled={!aiConfigured || short || writing}
            aria-busy={writing || undefined}
            aria-describedby={short ? shortId : undefined}
            onClick={() => void write()}
          >
            <Wand2 className="size-4" aria-hidden />
            Start the questions
          </Button>
          {short && (
            <p id={shortId} className="max-w-md text-xs text-pretty text-muted-foreground">
              {tooShortMessage(length)}
            </p>
          )}
          {status}
        </section>
        {general}
        <ConfirmDialog ref={confirmRef} />
      </div>
    );
  }

  const full = fixed.length >= JOB_LIMITS.questionsPerTask;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <MatrixPanel
          heading="Answer now (same every time)"
          subheading={outputTypeHeading(job.outputType)}
          headingLevel="h2"
          groups={[{ id: "fixed", title: "Questions to answer now", questions: fixed }]}
          state={state}
          activeId={active?.id ?? null}
          onSelect={select}
        >
          <div className="mt-3 flex flex-wrap gap-2 border-t border-border/60 pt-3">
            <Button type="button" variant="outline" size="sm" className="min-h-11 sm:min-h-8" disabled={full} onClick={() => openEditor("add")}>
              <Plus className="size-4" aria-hidden />
              Add question
            </Button>
            <Button type="button" variant="ghost" size="sm" className="min-h-11 sm:min-h-8" disabled={!aiConfigured || writing} aria-busy={writing || undefined} onClick={() => void regenerate()}>
              {writing ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}
              Regenerate
            </Button>
          </div>
          {status}
          <p className="mt-3 text-xs text-muted-foreground">Scored against your task description, answers and each question&apos;s files.</p>
        </MatrixPanel>
        <div className="flex min-w-0 flex-col gap-5">
          <section className="glass h-fit min-w-0 rounded-[1.75rem] p-4 sm:p-5">
            {editor ? (
              <QuestionEditor key={editor === "edit" ? active?.id : "add"} question={editor === "edit" ? (active ?? undefined) : undefined} onSubmit={saveQuestion} onCancel={closeEditor} />
            ) : !active ? (
              <p className="text-sm text-pretty text-muted-foreground">
                Nothing to answer now. Add a question.
              </p>
            ) : (
              <AnswerCard
                jobId={job.id}
                question={active}
                state={state}
                answerRef={answerRef}
                files={job.files.filter((f) => f.questionId === active.id)}
                aiConfigured={aiConfigured}
                onEdit={() => openEditor("edit")}
                onDelete={() => void remove(active)}
                onFileChange={onFileChange}
                onFileRemoved={onFileRemoved}
              />
            )}
          </section>
          {general}
        </div>
      </div>
      <PerUseList jobId={job.id} inputs={perUse} onQuestionChange={onQuestionChange} onQuestionRemoved={onQuestionRemoved} />
      <ConfirmDialog ref={confirmRef} />
    </div>
  );
}
