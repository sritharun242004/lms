/** Enhance (spec 2026-11-25 tasks, Step 1): rewrites the text in the box into a task brief. Nothing is stored. */
import { enhanceTaskBrief } from "@/lib/ai/claude";
import { consumeAiUsage } from "@/lib/ai/usage";
import { JOB_LIMITS } from "../limits";
import { EnhanceInputTooShortError, JobNotFoundError } from "./errors";
import { buildEnhanceTaskMessage } from "./instructions";
import { findOwnedJob } from "./jobs";
import { wordCount } from "./task-text";

/** Ownership, then at least five words, then one skill_enhance unit, then the call. */
export async function enhanceTask(jobId: string, userId: string, description: string): Promise<{ brief: string }> {
  const job = await findOwnedJob(jobId, userId);
  if (!job) throw new JobNotFoundError();
  if (wordCount(description) < JOB_LIMITS.enhanceMinWords) throw new EnhanceInputTooShortError();
  await consumeAiUsage(userId, "skill_enhance");
  return { brief: await enhanceTaskBrief(buildEnhanceTaskMessage({ title: job.title, description })) };
}
