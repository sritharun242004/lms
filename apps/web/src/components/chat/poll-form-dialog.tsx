"use client";

import * as React from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { BarChart3, Circle, Loader2, PieChart, Plus, X } from "lucide-react";
import { PollChartType } from "@lms/shared";
import type { ChatMessage } from "@/lib/api/services/message-service";
import { messageService } from "@/lib/api/services/message-service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const MAX_OPTIONS = 8;
const MIN_OPTIONS = 2;

// react-hook-form's useFieldArray needs an array of objects, not raw
// strings — this form-local shape gets flattened to string[] on submit.
const pollFormSchema = z.object({
  question: z.string().min(1, "Question is required").max(300),
  options: z
    .array(z.object({ value: z.string().min(1, "Option cannot be empty").max(100) }))
    .min(MIN_OPTIONS, `At least ${MIN_OPTIONS} options are required`)
    .max(MAX_OPTIONS, `At most ${MAX_OPTIONS} options are allowed`),
  chartType: z.nativeEnum(PollChartType),
});
type PollFormValues = z.infer<typeof pollFormSchema>;

const CHART_CHOICES: { value: PollChartType; label: string; icon: typeof BarChart3 }[] = [
  { value: PollChartType.BAR, label: "Bar", icon: BarChart3 },
  { value: PollChartType.DONUT, label: "Donut", icon: Circle },
  { value: PollChartType.PIE, label: "Pie", icon: PieChart },
];

export function PollFormDialog({
  trigger,
  groupId,
  onCreated,
}: {
  trigger: React.ReactNode;
  groupId: string;
  onCreated: (message: ChatMessage) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm<PollFormValues>({
    resolver: zodResolver(pollFormSchema),
    defaultValues: {
      question: "",
      options: [{ value: "" }, { value: "" }],
      chartType: PollChartType.BAR,
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "options" });

  React.useEffect(() => {
    if (open) {
      form.reset({
        question: "",
        options: [{ value: "" }, { value: "" }],
        chartType: PollChartType.BAR,
      });
    }
  }, [open, form]);

  async function onSubmit(values: PollFormValues) {
    setIsSubmitting(true);
    try {
      const res = await messageService.createPoll(groupId, {
        question: values.question,
        options: values.options.map((o) => o.value),
        chartType: values.chartType,
      });
      if (!res.success) throw new Error(res.error?.message || "Failed to create poll");
      toast.success("Poll posted");
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
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create a poll</DialogTitle>
          <DialogDescription>
            Ask a question with a few options — everyone in the group can vote live.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="question"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Question</FormLabel>
                  <FormControl>
                    <Input placeholder="What should we cover next?" autoFocus {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex flex-col gap-2">
              <FormLabel>Options</FormLabel>
              {fields.map((option, index) => (
                <FormField
                  key={option.id}
                  control={form.control}
                  name={`options.${index}.value`}
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input placeholder={`Option ${index + 1}`} {...field} />
                        </FormControl>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="shrink-0"
                          disabled={fields.length <= MIN_OPTIONS}
                          onClick={() => remove(index)}
                          aria-label="Remove option"
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                disabled={fields.length >= MAX_OPTIONS}
                onClick={() => append({ value: "" })}
              >
                <Plus className="size-3.5" />
                Add option
              </Button>
            </div>

            <FormField
              control={form.control}
              name="chartType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Chart type</FormLabel>
                  <FormControl>
                    <div className="grid grid-cols-3 gap-2">
                      {CHART_CHOICES.map(({ value, label, icon: Icon }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => field.onChange(value)}
                          className={cn(
                            "flex flex-col items-center gap-1.5 rounded-lg border border-input px-3 py-2.5 text-sm transition-colors hover:bg-accent",
                            field.value === value && "border-primary bg-primary/5 text-primary"
                          )}
                        >
                          <Icon className="size-5" />
                          {label}
                        </button>
                      ))}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="size-4 animate-spin" />}
                Post poll
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
