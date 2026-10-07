"use client";

import * as React from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { usePathname } from "next/navigation";
import {
  createScaleSchema,
  SCALE_DEFAULT_MAX,
  SCALE_LEFT_LABEL,
  SCALE_MAX_STATEMENTS,
  SCALE_MAX_UPPER_BOUND,
  SCALE_MIN,
  SCALE_RIGHT_LABEL,
} from "@cms/shared";
import type { ChatMessage } from "@/lib/api/services/message-service";
import { messageService } from "@/lib/api/services/message-service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type ScaleFormValues = { statements: { text: string; max: string }[] };

const blankStatement = () => ({ text: "", max: String(SCALE_DEFAULT_MAX) });

export function ScaleFormDialog({
  trigger,
  groupId,
  onCreated,
  autoOpen = false,
}: {
  trigger: React.ReactNode;
  groupId: string;
  onCreated: (message: ChatMessage) => void;
  autoOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(autoOpen);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const loadedTemplateRef = React.useRef(false);
  const pathname = usePathname();

  const form = useForm<ScaleFormValues>({ defaultValues: { statements: [blankStatement()] } });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "statements" });
  const watched = useWatch({ control: form.control, name: "statements" });

  React.useEffect(() => {
    if (!open) {
      loadedTemplateRef.current = false;
      return;
    }
    const saved = sessionStorage.getItem("cms-scale-template");
    if (saved) {
      sessionStorage.removeItem("cms-scale-template");
      try {
        const template = JSON.parse(saved) as { statements?: { text?: unknown; max?: unknown }[] };
        if (Array.isArray(template.statements) && template.statements.length > 0) {
          loadedTemplateRef.current = true;
          form.reset({
            statements: template.statements.map((statement) => ({
              text: String(statement.text ?? ""),
              max: String(Number(statement.max) || SCALE_DEFAULT_MAX),
            })),
          });
          return;
        }
      } catch {
        // Fall through to a clean form when a stale template is malformed.
      }
    }
    if (autoOpen && loadedTemplateRef.current) return;
    form.reset({ statements: [blankStatement()] });
  }, [autoOpen, open, form]);

  async function onSubmit(values: ScaleFormValues) {
    const parsed = createScaleSchema.safeParse({
      statements: values.statements.map((row) => ({ text: row.text, max: Number(row.max) })),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check the scale and try again");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await messageService.createScale(groupId, parsed.data);
      if (!res.success) throw new Error(res.error?.message || "Failed to post scale");
      toast.success("Scale posted");
      setOpen(false);
      onCreated(res.data!);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create a scale</DialogTitle>
          <DialogDescription>
            Participants slide from {SCALE_MIN} ({SCALE_LEFT_LABEL}) to the maximum ({SCALE_RIGHT_LABEL}) for
            every statement. All statements are posted together as one scale.
          </DialogDescription>
        </DialogHeader>
        <Button variant="outline" size="sm" className="self-start" asChild>
          <a href={`/questions?tab=questions&returnTo=${encodeURIComponent(pathname)}`}>Question repository</a>
        </Button>

        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          {fields.map((field, index) => (
            <div key={field.id} className="grid gap-3 rounded-xl border border-border/60 bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor={`scale-statement-${field.id}`}>Statement {index + 1}</Label>
                {fields.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={`Remove statement ${index + 1}`}
                    onClick={() => remove(index)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
              <Input
                id={`scale-statement-${field.id}`}
                placeholder="I understand the concepts covered today."
                autoFocus={index === 0}
                {...form.register(`statements.${index}.text` as const)}
              />
              <div className="flex items-center gap-3">
                <Label htmlFor={`scale-max-${field.id}`} className="shrink-0">
                  Maximum
                </Label>
                <Input
                  id={`scale-max-${field.id}`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={SCALE_MAX_UPPER_BOUND}
                  step={1}
                  className="w-24"
                  {...form.register(`statements.${index}.max` as const)}
                />
                <span className="text-xs text-muted-foreground">
                  {SCALE_MIN} → {watched?.[index]?.max || "?"}
                </span>
              </div>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            disabled={fields.length >= SCALE_MAX_STATEMENTS}
            onClick={() => append(blankStatement())}
          >
            <Plus className="size-4" />
            Add statement
          </Button>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              Publish
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
