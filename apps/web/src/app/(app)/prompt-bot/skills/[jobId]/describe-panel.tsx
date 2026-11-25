"use client";
import { Lightbulb } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { JOB_LIMITS } from "@/lib/skills/limits";

const PLACEHOLDER = "What you do, step by step, what you start from (files, data, notes), what you hand over, and who it's for.";
const count = (n: number) => n.toLocaleString("en-US");

/** Step 1. The workspace owns saving (debounced, flushed before Suggest and Generate, sent on page leave). */
export function DescribePanel({ jobId, description, onDescriptionChange }: { jobId: string; description: string; onDescriptionChange(value: string): void }) {
  const id = `job-description-${jobId}`;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <section className="glass rounded-[1.75rem] p-5">
        <label htmlFor={id} className="text-sm font-medium">
          Describe the job as you do it today
        </label>
        <Textarea
          id={id}
          value={description}
          maxLength={JOB_LIMITS.descriptionChars}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder={PLACEHOLDER}
          aria-describedby={`${id}-count ${id}-hint-text`}
          className="mt-2 min-h-64 resize-y bg-white/60 leading-relaxed dark:bg-white/5"
        />
        <p id={`${id}-count`} className="mt-2 text-right text-xs tabular-nums text-muted-foreground">
          {count(description.length)} / {count(JOB_LIMITS.descriptionChars)}
        </p>
      </section>
      <aside className="glass h-fit rounded-[1.75rem] p-5 text-sm" aria-labelledby={`${id}-hint`}>
        <h2 id={`${id}-hint`} className="flex items-center gap-2 font-semibold">
          <Lightbulb className="size-4 text-primary" aria-hidden />
          What to include
        </h2>
        <p id={`${id}-hint-text`} className="mt-2 text-pretty text-muted-foreground">
          Cover the steps you take, what you start from, what you hand over, who reads it, how you know it&apos;s good.
        </p>
      </aside>
    </div>
  );
}
