import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FormError } from "@/lib/forms/form-service";
import { getPublicForm, hasFileUpload } from "@/lib/forms/responses";
import { initialAnswers } from "@/lib/forms/prefill";
import { PublicFormView } from "@/components/forms/public-form-view";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function loadForm(id: string) {
  try {
    return await getPublicForm(id);
  } catch (error) {
    if (error instanceof FormError) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const form = await loadForm(id);
  // Shared links get passed around; keep them out of search results.
  return { title: form.title, robots: { index: false, follow: false } };
}

export default async function PublicFormPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const form = await loadForm(id);
  const questions = form.sections.flatMap((section) => section.questions);

  return (
    <PublicFormView
      form={JSON.parse(
        JSON.stringify({
          id: form.id,
          title: form.title,
          description: form.description,
          sections: form.sections.map((section) => ({
            id: section.id,
            title: section.title,
            description: section.description,
            questions: section.questions.map((q) => ({
              id: q.id,
              type: q.type,
              title: q.title,
              description: q.description,
              required: q.required,
              config: q.config,
            })),
          })),
        })
      )}
      initialAnswers={initialAnswers(questions, await searchParams)}
      unavailableReason={hasFileUpload(form) ? "This form has a file upload, which needs you to sign in. Ask the organiser for another way to submit it." : null}
    />
  );
}
