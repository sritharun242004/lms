import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
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

  const forms = await prisma.form.findMany({
    where: user.role === "ADMIN" ? {} : { createdById: user.id },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { sections: true, responses: true } } },
  });

  return (
    <FormsFeedbackTabs
      forms={JSON.parse(JSON.stringify(forms))}
      initialTab={tab === "feedback" ? "feedback" : "forms"}
    />
  );
}
