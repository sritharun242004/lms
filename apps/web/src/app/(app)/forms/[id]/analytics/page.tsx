import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getFormAnalytics } from "@/lib/forms/analytics";
import { FormError } from "@/lib/forms/form-service";
import { FormAnalytics } from "@/components/forms/form-analytics";

export default async function FormAnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "MENTOR" && user.role !== "ADMIN")) {
    redirect("/dashboard");
  }

  const { id } = await params;
  let analytics;
  try {
    analytics = await getFormAnalytics(user, id);
  } catch (error) {
    if (error instanceof FormError) redirect("/forms");
    throw error;
  }

  return <FormAnalytics analytics={analytics} />;
}
