"use client";

import Link from "next/link";
import { CheckCircle2, FileText } from "lucide-react";
import type { ChatMessage, FormInvitationData } from "@/lib/api/services/message-service";
import { Button } from "@/components/ui/button";
import { INTERACTIVE_CARD_WIDTH } from "@/components/chat/interactive-card";
import { cn } from "@/lib/utils";

export function FormInvitationMessage({
  message,
  formInvitation,
}: {
  message: ChatMessage;
  formInvitation: FormInvitationData;
}) {
  const isSubmitted = formInvitation.status === "SUBMITTED";

  return (
    <div className={cn("flex flex-col gap-2 rounded-xl border border-border bg-card p-4", INTERACTIVE_CARD_WIDTH)}>
      <div className="flex items-center gap-2 text-sm font-medium">
        <FileText className="size-4 text-primary" />
        {formInvitation.formTitle}
      </div>
      {formInvitation.formDescription ? (
        <p className="text-sm text-muted-foreground">{formInvitation.formDescription}</p>
      ) : null}
      <p className="text-xs text-muted-foreground">Sent by {message.sender.name}</p>
      {isSubmitted ? (
        <div className="flex items-center gap-2 text-sm font-medium text-emerald-600">
          <CheckCircle2 className="size-4" /> Submitted
        </div>
      ) : (
        <Button asChild size="sm" className="self-start">
          <Link href={`/forms/fill/${formInvitation.id}`}>Click to fill the form</Link>
        </Button>
      )}
    </div>
  );
}
