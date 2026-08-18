import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { CoachOnboarding } from "@/components/admin/coach-onboarding";
import { listCoachAccounts } from "@/lib/admin/coach-management";
export default async function CoachOnboardingPage() {
  const user = await getCurrentUser(); if (user?.role !== "ADMIN") redirect("/dashboard");
  const coaches = await listCoachAccounts(user);
  return <CoachOnboarding
    coaches={coaches.map((coach) => ({
      ...coach,
      createdAt: coach.createdAt.toISOString(),
      disabledAt: coach.disabledAt?.toISOString() ?? null,
    }))}
  />;
}
