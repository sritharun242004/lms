"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { initialAnswers } from "@/lib/forms/prefill";
import { QuestionRenderer, type QuestionLike } from "./question-renderer";

type FormSectionLike = { id: string; title: string | null; description: string | null; questions: QuestionLike[] };
type FormLike = {
  id: string;
  title: string;
  description: string | null;
  sections: FormSectionLike[];
};
type InvitationLike = {
  id: string;
  status: "SENT" | "OPENED" | "SUBMITTED";
  groupId: string | null;
  form: FormLike;
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.error?.message || "Request failed");
  return result.data as T;
}

export function FormFillView({ invitationId }: { invitationId: string }) {
  const [invitation, setInvitation] = React.useState<InvitationLike | null>(null);
  const [answers, setAnswers] = React.useState<Record<string, unknown>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [submitted, setSubmitted] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    requestJson<{ invitation: InvitationLike }>(`/api/v1/forms/invitations/${invitationId}`)
      .then((data) => {
        if (!cancelled) {
          setInvitation(data.invitation);
          setAnswers(initialAnswers(data.invitation.form.sections.flatMap((section) => section.questions)));
          setSubmitted(data.invitation.status === "SUBMITTED");
        }
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Unable to load form"));
    return () => {
      cancelled = true;
    };
  }, [invitationId]);

  async function submit() {
    if (!invitation) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await requestJson(`/api/v1/forms/${invitation.form.id}/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invitationId: invitation.id,
          answers: Object.entries(answers).map(([questionId, value]) => ({ questionId, value })),
        }),
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit the form");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (error && !invitation) {
    return <p className="p-6 text-sm text-destructive">{error}</p>;
  }
  if (!invitation) {
    return <p className="p-6 text-sm text-muted-foreground">Loading form…</p>;
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-xl p-10 text-center">
        <CheckCircle2 className="mx-auto size-10 text-emerald-600" />
        <h1 className="mt-4 text-2xl font-bold">Thanks — your response was recorded.</h1>
        {invitation.groupId ? (
          <Button asChild className="mt-6">
            <Link href={`/chat/${invitation.groupId}`}>Return to chat</Link>
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">{invitation.form.title}</h1>
        {invitation.form.description ? (
          <p className="mt-2 whitespace-pre-line text-muted-foreground">{invitation.form.description}</p>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {invitation.form.sections.map((section) => (
        <Card key={section.id}>
          <CardContent className="flex flex-col gap-4 p-6">
            {section.title ? <h2 className="font-semibold">{section.title}</h2> : null}
            {section.questions.map((question) => (
              <QuestionRenderer
                key={question.id}
                question={question}
                value={answers[question.id]}
                onChange={(value) => {
                  setAnswers((current) => ({ ...current, [question.id]: value }));
                  // An old "X is required" shouldn't linger once they're fixing it.
                  setError(null);
                }}
              />
            ))}
          </CardContent>
        </Card>
      ))}

      <Button onClick={submit} disabled={isSubmitting} size="lg">
        {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
        Submit
      </Button>
    </div>
  );
}
