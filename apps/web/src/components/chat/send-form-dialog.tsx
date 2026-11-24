"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { ChatMessage } from "@/lib/api/services/message-service";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type PublishedForm = { id: string; title: string };

export function SendFormDialog({
  trigger,
  groupId,
  onSent,
}: {
  trigger: React.ReactNode;
  groupId: string;
  onSent: (message: ChatMessage) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [forms, setForms] = React.useState<PublishedForm[]>([]);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [isSending, setIsSending] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    fetch("/api/v1/forms?status=PUBLISHED")
      .then((res) => res.json())
      .then((result) => {
        if (result.success) setForms(result.data.forms);
      });
  }, [open]);

  async function send() {
    if (!selected) return;
    setIsSending(true);
    try {
      const response = await fetch(`/api/v1/groups/${groupId}/messages/form`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formId: selected }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error?.message || "Unable to send form");
      onSent(result.data);
      toast.success("Form sent");
      setOpen(false);
      setSelected(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to send form");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send a form</DialogTitle>
          <DialogDescription>Pick a published form to send to this group.</DialogDescription>
        </DialogHeader>
        {forms.length === 0 ? (
          <p className="text-sm text-muted-foreground">No published forms yet. Publish one from the Forms page first.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {forms.map((form) => (
              <label key={form.id} className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm">
                <input type="radio" name="form" checked={selected === form.id} onChange={() => setSelected(form.id)} />
                {form.title}
              </label>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!selected || isSending} onClick={send}>
            {isSending ? <Loader2 className="size-4 animate-spin" /> : null}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
