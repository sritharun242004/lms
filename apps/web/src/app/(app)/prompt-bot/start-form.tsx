"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useLocalDraft } from "@/components/prompt-bot/use-local-draft";
import { createSession } from "@/lib/prompt-bot/client";

/** `draftKey` names the browser storage slot that keeps unsubmitted text; include the user's id. */
export function StartForm({ draftKey }: { draftKey: string }) {
  const router = useRouter();
  const [value, setValue, clearDraft] = useLocalDraft(draftKey);
  const [busy, setBusy] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!value.trim() || busy) return;
    setBusy(true);
    const result = await createSession(value);
    if (result.ok) {
      clearDraft();
      router.push(`/prompt-bot/${result.data.id}`);
    } else {
      toast.error(result.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="glass rounded-[1.75rem] p-5">
      <label htmlFor="prompt-bot-start" className="text-sm font-medium">
        What do you want AI to do?
      </label>
      <Textarea
        id="prompt-bot-start"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(e);
        }}
        placeholder="e.g. Write an email to my board about our Q3 results"
        className="mt-2 min-h-32 resize-y bg-white/60 dark:bg-white/5"
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">We&apos;ll check it against the Design Think questions.</span>
        <Button type="submit" disabled={!value.trim() || busy}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ArrowRight className="size-4" aria-hidden />}
          Start
        </Button>
      </div>
    </form>
  );
}
