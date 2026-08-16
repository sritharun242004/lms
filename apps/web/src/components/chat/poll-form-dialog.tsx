"use client";

import * as React from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { BarChart3, Circle, Loader2, PieChart, Plus, X } from "lucide-react";
import { PollChartType } from "@cms/shared";
import type { ChatMessage } from "@/lib/api/services/message-service";
import { messageService } from "@/lib/api/services/message-service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";
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
  autoOpen = false,
}: {
  trigger: React.ReactNode;
  groupId: string;
  onCreated: (message: ChatMessage) => void;
  autoOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(autoOpen);
  const pathname = usePathname();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [quizName, setQuizName] = React.useState("");

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
      const saved = sessionStorage.getItem("cms-poll-template");
      if (saved) {
        const template = JSON.parse(saved) as { question: string; options: string[]; chartType?: PollChartType };
        form.reset({ question: template.question, options: template.options.map((value) => ({ value })), chartType: template.chartType ?? PollChartType.BAR });
        sessionStorage.removeItem("cms-poll-template");
        return;
      }
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

  async function saveToRepository() {
    const valid = await form.trigger();
    if (!valid) return;
    if (!quizName.trim()) {
      toast.error("Enter a quiz name before saving");
      return;
    }
    const values = form.getValues();
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/v1/questions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: quizName,
          question: values.question,
          options: values.options.map((option) => option.value),
          chartType: values.chartType,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Could not save quiz");
      toast.success("Quiz saved to repository");
      setQuizName("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save quiz");
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
        <Button variant="outline" size="sm" className="self-start" asChild><a href={`/questions?returnTo=${encodeURIComponent(pathname)}`}>Quiz repository</a></Button>

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

            <div className="grid gap-2 rounded-xl border border-border/70 bg-muted/25 p-3">
              <FormLabel htmlFor="repository-name">Quiz name</FormLabel>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input id="repository-name" value={quizName} onChange={(event) => setQuizName(event.target.value)} placeholder="Product knowledge — Week 1" />
                <Button type="button" variant="outline" onClick={saveToRepository} disabled={isSubmitting}>Save to repository</Button>
              </div>
            </div>

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
