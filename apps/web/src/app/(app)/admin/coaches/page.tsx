import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { CoachOnboarding } from "@/components/admin/coach-onboarding";
import { listCoachAccounts } from "@/lib/admin/coach-management";
export default async function CoachOnboardingPage() {
  const user = await getCurrentUser(); if (user?.role !== "ADMIN") redirect("/dashboard");
  const [approvals, coaches] = await Promise.all([
    prisma.coachEmailApproval.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, email: true, createdAt: true, claimedAt: true } }),
    listCoachAccounts(user),
  ]);
  return <CoachOnboarding
    approvals={approvals.map((item) => ({ ...item, createdAt: item.createdAt.toISOString(), claimedAt: item.claimedAt?.toISOString() ?? null }))}
    coaches={coaches.map((coach) => ({
      ...coach,
      createdAt: coach.createdAt.toISOString(),
      disabledAt: coach.disabledAt?.toISOString() ?? null,
    }))}
  />;
}
