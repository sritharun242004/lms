"use client";
import * as React from "react";
import { ArrowDownToLine, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AnswerCheck, checkOnShortcut } from "@/components/prompt-bot/answer-check";
import type { MatrixAnswers } from "@/components/prompt-bot/use-matrix-answers";
import type { JobFileView, TaskQuestionView } from "@/lib/skills/jobs/types";
import { QuestionFiles } from "./question-files";

const ANSWER_MAX = 4000;
const ICON_BUTTON = "size-11 shrink-0 text-muted-foreground hover:text-foreground sm:size-9";

type Props = {
  jobId: string;
  question: TaskQuestionView;
  state: MatrixAnswers;
  answerRef: React.RefObject<HTMLTextAreaElement | null>;
  /** This question's own files. */
  files: JobFileView[];
  aiConfigured: boolean;
  onEdit(): void;
  onMove(): void;
  onDelete(): void;
  onFileChange(file: JobFileView): void;
  onFileRemoved(fileId: string): void;
};

/** The selected "Answer now" question: its answer, the check, and the files that answer it. */
export function AnswerCard({ jobId, question, state, answerRef, files, aiConfigured, onEdit, onMove, onDelete, onFileChange, onFileRemoved }: Props) {
  const answerId = React.useId();
  const helpId = `${answerId}-help`;
  // The visible tooltip names the action; the question keeps each button's name unique.
  const named = (action: string) => `${action}: ${question.text}`;

  return (
    <>
      <div className="flex items-start gap-2">
        <label htmlFor={answerId} className="min-w-0 flex-1 pt-2 text-sm font-medium text-balance sm:pt-1.5">
          {question.text}
        </label>
        <div className="-mr-2 -mt-1 flex shrink-0 items-center">
          <Button type="button" variant="ghost" size="icon" className={ICON_BUTTON} aria-label={named("Edit question")} title="Edit question" onClick={onEdit}>
            <Pencil className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={ICON_BUTTON}
            aria-label={named('Move to "Claude will ask each time"')}
            title='Move to "Claude will ask each time"'
            onClick={onMove}
          >
            <ArrowDownToLine className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={`${ICON_BUTTON} hover:bg-destructive/10 hover:text-destructive`}
            aria-label={named("Delete question")}
            title="Delete question"
            onClick={onDelete}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
      <Textarea
        id={answerId}
        ref={answerRef}
        value={state.answerFor(question.id).answer}
        maxLength={ANSWER_MAX}
        onChange={(e) => state.updateAnswer(question.id, { answer: e.target.value })}
        onKeyDown={checkOnShortcut(state, question.id)}
        placeholder={question.guidance}
        aria-describedby={helpId}
        className="mt-2 min-h-40 resize-y bg-white/60 dark:bg-white/5"
      />
      <AnswerCheck key={question.id} state={state} questionId={question.id} question={question.text} />
      <p id={helpId} className="mt-2 text-xs text-muted-foreground">
        Short notes are fine. Anything your description or files already say counts too.
      </p>
      <QuestionFiles jobId={jobId} question={question} files={files} aiConfigured={aiConfigured} onFileChange={onFileChange} onFileRemoved={onFileRemoved} />
    </>
  );
}
