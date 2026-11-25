"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLocalDraft } from "@/components/prompt-bot/use-local-draft";
import { createJob } from "@/lib/skills/jobs/client";
import { JOB_LIMITS } from "@/lib/skills/limits";

const PLACEHOLDER = [
  "e.g. Every month I turn the finance export and my notes into the board deck:",
  "1. pull the numbers from the Excel export",
  "2. update the KPI slides in our template",
  "3. write a one-page summary for the board",
  "It goes to five board members, who want numbers first and no surprises.",
].join("\n");

/** `draftKey` names the browser storage slots that keep unsubmitted text; include the user's id. */
export function NewJobForm({ draftKey }: { draftKey: string }) {
  const router = useRouter();
  const [title, setTitle, clearTitle] = useLocalDraft(`${draftKey}:title`);
  const [description, setDescription, clearDescription] = useLocalDraft(`${draftKey}:description`);
  const [busy, setBusy] = React.useState(false);
  const ready = description.trim().length > 0 && !busy;

  async function submit(event: React.FormEvent | React.KeyboardEvent) {
    event.preventDefault();
    if (!ready) return;
    setBusy(true);
    const trimmedTitle = title.trim();
    const result = await createJob({ ...(trimmedTitle ? { title: trimmedTitle } : {}), description });
    if (result.ok) {
      clearTitle();
      clearDescription();
      router.push(`/prompt-bot/skills/${result.data.id}`);
      return;
    }
    toast.error(result.message);
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="glass rounded-[1.75rem] p-5 sm:p-6" aria-labelledby="new-job-heading">
      <h2 id="new-job-heading" className="text-lg font-semibold">
        New task
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        One piece of work you repeat. Next you&apos;ll describe it in detail, answer a few questions and add your files.
      </p>

      <label htmlFor="new-job-title" className="mt-5 block text-sm font-medium">
        Task title <span className="font-normal text-muted-foreground">(optional)</span>
      </label>
      <Input
        id="new-job-title"
        value={title}
        maxLength={JOB_LIMITS.titleChars}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. Monthly board update"
        className="mt-2 bg-white/60 dark:bg-white/5"
      />

      <label htmlFor="new-job-description" className="mt-4 block text-sm font-medium">
        What&apos;s the task?
      </label>
      <Textarea
        id="new-job-description"
        value={description}
        maxLength={JOB_LIMITS.descriptionChars}
        aria-describedby="new-job-hint"
        onChange={(e) => setDescription(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit(e);
        }}
        placeholder={PLACEHOLDER}
        className="mt-2 min-h-44 resize-y bg-white/60 leading-relaxed dark:bg-white/5"
      />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span id="new-job-hint" className="text-xs text-muted-foreground">
          Include the steps, what you start from, what you hand over and who it&apos;s for.{" "}
          <span className="whitespace-nowrap">
            <kbd className="rounded border border-border/70 px-1 font-sans">⌘/Ctrl</kbd> +{" "}
            <kbd className="rounded border border-border/70 px-1 font-sans">Enter</kbd> starts.
          </span>
        </span>
        <Button type="submit" size="lg" disabled={!ready}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ArrowRight className="size-4" aria-hidden />}
          {busy ? "Starting…" : "Start task"}
        </Button>
      </div>
    </form>
  );
}
