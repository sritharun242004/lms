import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { FeedbackDashboard } from "@/components/forms/feedback-dashboard";

export default async function FeedbackPage() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "MENTOR" && user.role !== "ADMIN")) {
    redirect("/dashboard");
  }
  return <FeedbackDashboard />;
}
