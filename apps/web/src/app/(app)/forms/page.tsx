import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listForms } from "@/lib/forms/form-service";
import { FormsFeedbackTabs } from "@/components/forms/forms-feedback-tabs";

export default async function FormsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "MENTOR" && user.role !== "ADMIN")) {
    redirect("/dashboard");
  }

  const { tab } = await searchParams;

  const forms = (await listForms(user, {})).map((form) => ({
    ...form,
    // The edit page only opens for the creator or an admin; a template is
    // visible to every staff member but editable only by them.
    canEdit: user.role === "ADMIN" || form.createdById === user.id,
  }));

  return (
    <FormsFeedbackTabs
      forms={JSON.parse(JSON.stringify(forms))}
      initialTab={tab === "feedback" ? "feedback" : "forms"}
    />
  );
}
