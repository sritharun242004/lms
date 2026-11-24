import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getFormWithStructure, FormError } from "@/lib/forms/form-service";
import { FormBuilder } from "@/components/forms/form-builder";

export default async function FormEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "MENTOR" && user.role !== "ADMIN")) {
    redirect("/dashboard");
  }

  const { id } = await params;
  let form;
  try {
    form = await getFormWithStructure(id);
  } catch (error) {
    if (error instanceof FormError) redirect("/forms");
    throw error;
  }

  if (form.createdById !== user.id && user.role !== "ADMIN") {
    redirect("/forms");
  }

  return (
    <FormBuilder
      form={{ id: form.id, title: form.title, description: form.description, status: form.status, category: form.category }}
      initialSections={JSON.parse(
        JSON.stringify(
          form.sections.map((section) => ({
            title: section.title,
            description: section.description,
            questions: section.questions.map((q) => ({
              type: q.type,
              title: q.title,
              description: q.description ?? "",
              required: q.required,
              config: q.config,
              templateId: q.templateId ?? undefined,
            })),
          }))
        )
      )}
    />
  );
}
