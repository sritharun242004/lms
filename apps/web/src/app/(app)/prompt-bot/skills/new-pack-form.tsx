"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLocalDraft } from "@/components/prompt-bot/use-local-draft";
import { createPack } from "@/lib/skills/client";

/** `draftKey` names the browser storage slots that keep unsubmitted text; include the user's id. */
export function NewPackForm({ draftKey }: { draftKey: string }) {
  const router = useRouter();
  const [description, setDescription, clearDescription] = useLocalDraft(`${draftKey}:description`);
  const [role, setRole, clearRole] = useLocalDraft(`${draftKey}:role`);
  const [busy, setBusy] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!description.trim() || busy) return;
    setBusy(true);
    const result = await createPack(description, role);
    if (result.ok) {
      clearDescription();
      clearRole();
      router.push(`/prompt-bot/skills/${result.data.id}`);
    } else {
      toast.error(result.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="glass rounded-[1.75rem] p-5">
      <label htmlFor="skills-description" className="text-sm font-medium">
        Describe a task or your day-to-day work
      </label>
      <Textarea
        id="skills-description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit(e);
        }}
        placeholder="e.g. Every Monday I review the sales numbers, write a board update and plan the team's week"
        className="mt-2 min-h-32 resize-y bg-white/60 dark:bg-white/5"
      />
      <label htmlFor="skills-role" className="mt-4 block text-sm font-medium">
        Your role <span className="font-normal text-muted-foreground">(optional)</span>
      </label>
      <Input
        id="skills-role"
        value={role}
        maxLength={200}
        onChange={(e) => setRole(e.target.value)}
        placeholder="e.g. CTO of a 200-person SaaS company"
        className="mt-2 bg-white/60 dark:bg-white/5"
      />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">We&apos;ll propose skills to build and existing ones to use.</span>
        <Button type="submit" disabled={!description.trim() || busy}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
          {busy ? "Building your list…" : "Build skill list"}
        </Button>
      </div>
    </form>
  );
}
