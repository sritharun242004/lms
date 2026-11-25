"use client";

import * as React from "react";
import { toast } from "sonner";
import { Bot } from "lucide-react";
import { groupService } from "@/lib/api/services/group-service";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const SAVE_FAILED = "Couldn't update Prompt Bot. Try again.";

/** Admin-only switch: whether this group's participants can open Prompt Bot. */
export function GroupPromptBotToggle({
  groupId,
  groupName,
  initialEnabled,
  variant = "card",
}: {
  groupId: string;
  groupName: string;
  initialEnabled: boolean;
  /** "compact": a small pill for the chat header, so an admin can flip it mid-session. */
  variant?: "card" | "compact";
}) {
  const [enabled, setEnabled] = React.useState(initialEnabled);
  const [isSaving, setIsSaving] = React.useState(false);
  const switchId = React.useId();
  const helpId = `${switchId}-help`;

  async function handleChange(next: boolean) {
    setEnabled(next);
    setIsSaving(true);
    try {
      const res = await groupService.update(groupId, { promptBotEnabled: next });
      if (!res.success) throw new Error(res.error?.message);
      toast.success(`Prompt Bot is ${next ? "on" : "off"} for ${groupName}`);
    } catch (error) {
      setEnabled(!next);
      toast.error(error instanceof Error && error.message ? error.message : SAVE_FAILED);
    } finally {
      setIsSaving(false);
    }
  }

  if (variant === "compact") {
    return (
      <div
        data-state={enabled ? "on" : "off"}
        title="Let participants in this group use Prompt Bot"
        className="flex shrink-0 items-center gap-2 rounded-full border border-border/70 px-2.5 py-1 text-xs transition-colors data-[state=on]:border-primary/25 data-[state=on]:bg-primary/[.055]"
      >
        <Bot aria-hidden className="size-3.5 shrink-0 text-muted-foreground [[data-state=on]_&]:text-primary" />
        <Label htmlFor={switchId} className="hidden cursor-pointer font-medium sm:inline">
          Prompt Bot
        </Label>
        <Switch
          id={switchId}
          checked={enabled}
          onCheckedChange={handleChange}
          disabled={isSaving}
          aria-label={`Prompt Bot for participants in ${groupName}`}
          aria-busy={isSaving || undefined}
        />
      </div>
    );
  }

  return (
    <div
      data-state={enabled ? "on" : "off"}
      className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 px-3 py-2.5 transition-colors data-[state=on]:border-primary/25 data-[state=on]:bg-primary/[.04]"
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <Bot
          aria-hidden
          className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-colors [[data-state=on]_&]:text-primary"
        />
        <div className="flex min-w-0 flex-col gap-1">
          <Label htmlFor={switchId} className="cursor-pointer">
            Prompt Bot for participants
          </Label>
          <p id={helpId} className="text-xs text-muted-foreground">
            Participants in this group can open Prompt Bot.
          </p>
        </div>
      </div>
      <Switch
        id={switchId}
        checked={enabled}
        onCheckedChange={handleChange}
        disabled={isSaving}
        aria-describedby={helpId}
        aria-busy={isSaving || undefined}
      />
    </div>
  );
}
