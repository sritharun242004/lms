"use client";

import * as React from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { HONEYPOT_FIELD } from "@/lib/forms/public-link";
import { QuestionRenderer, type QuestionLike } from "./question-renderer";

type PublicForm = {
  id: string;
  title: string;
  description: string | null;
  sections: { id: string; title: string | null; description: string | null; questions: QuestionLike[] }[];
};

export function PublicFormView({
  form,
  initialAnswers,
  unavailableReason,
}: {
  form: PublicForm;
  initialAnswers: Record<string, unknown>;
  unavailableReason: string | null;
}) {
  const [answers, setAnswers] = React.useState<Record<string, unknown>>(initialAnswers);
  const [trap, setTrap] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitted, setSubmitted] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/public/forms/${form.id}/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [HONEYPOT_FIELD]: trap,
          answers: Object.entries(answers).map(([questionId, value]) => ({ questionId, value })),
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error?.message || "Unable to submit the form");
      setSubmitted(true);
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit the form");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <CheckCircle2 className="mx-auto size-10 text-success" aria-hidden="true" />
        <h1 className="mt-4 text-2xl font-bold">Thank you — your response was recorded.</h1>
        <p className="mt-2 text-muted-foreground">You can close this page now.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
      <header>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{form.title}</h1>
        {form.description ? (
          <p className="mt-3 whitespace-pre-line text-muted-foreground">{form.description}</p>
        ) : null}
      </header>

      {unavailableReason ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {unavailableReason}
        </p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-6">
          {form.sections.map((section) => (
            <Card key={section.id}>
              <CardContent className="flex flex-col gap-4 p-4 sm:p-6">
                {section.title ? <h2 className="font-semibold">{section.title}</h2> : null}
                {section.description ? (
                  <p className="whitespace-pre-line text-sm text-muted-foreground">{section.description}</p>
                ) : null}
                {section.questions.map((question) => (
                  <QuestionRenderer
                    key={question.id}
                    question={question}
                    value={answers[question.id]}
                    onChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))}
                  />
                ))}
              </CardContent>
            </Card>
          ))}

          {/* Spam trap: invisible and unreachable for people, filled by bots. */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
            <label>
              Leave this empty
              <input
                tabIndex={-1}
                autoComplete="off"
                name={HONEYPOT_FIELD}
                value={trap}
                onChange={(e) => setTrap(e.target.value)}
              />
            </label>
          </div>

          {error ? (
            <p role="alert" className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <Button type="submit" size="lg" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
            Submit
          </Button>
        </form>
      )}
    </main>
  );
}
