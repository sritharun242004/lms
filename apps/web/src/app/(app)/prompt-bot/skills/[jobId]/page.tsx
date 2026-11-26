import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAiConfigured } from "@/lib/ai/config";
import { prisma } from "@/lib/db/prisma";
import { loadJobView } from "@/lib/skills/jobs/jobs";
import { maxJobFileBytes } from "@/lib/skills/jobs/storage";
import { JobWorkspace } from "./job-workspace";

export default async function JobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return redirect("/login");
  const { jobId } = await params;
  const view = await loadJobView(jobId, user.id);
  if (!view) {
    // Links to packs from the earlier Skills Builder used this URL; keep them working.
    const pack = await prisma.skillPack.findFirst({ where: { id: jobId, userId: user.id }, select: { id: true } });
    if (pack) return redirect(`/prompt-bot/skills/legacy/${pack.id}`);
    notFound();
  }
  // Viewing, editing text and downloads need no AI; the workspace disables the AI actions without it.
  return <JobWorkspace initial={view} aiConfigured={isAiConfigured()} isAdmin={user.role === "ADMIN"} maxFileBytes={maxJobFileBytes()} />;
}
