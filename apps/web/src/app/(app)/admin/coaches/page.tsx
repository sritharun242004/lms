import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { CoachOnboarding } from "@/components/admin/coach-onboarding";
export default async function CoachOnboardingPage() {
  const user = await getCurrentUser(); if (user?.role !== "ADMIN") redirect("/dashboard");
  const approvals = await prisma.coachEmailApproval.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, email: true, createdAt: true, claimedAt: true } });
  return <CoachOnboarding approvals={approvals.map((item) => ({ ...item, createdAt: item.createdAt.toISOString(), claimedAt: item.claimedAt?.toISOString() ?? null }))} />;
}
