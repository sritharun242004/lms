"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { ChatMessage } from "@/lib/api/services/message-service";
import { messageService } from "@/lib/api/services/message-service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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

// Local to this form — the shared `createWordCloudSchema` marks these
// fields optional-with-default for API callers, which doesn't line up
// with react-hook-form's default-values-are-required typing.
const wordCloudFormSchema = z.object({
  question: z.string().min(1, "Question is required").max(300),
  maxWordsPerParticipant: z.coerce.number().int().min(1).max(10),
  maxWordLength: z.coerce.number().int().min(10).max(40),
  allowMultipleSubmissions: z.boolean(),
  profanityFilter: z.boolean(),
});
type WordCloudFormValues = z.infer<typeof wordCloudFormSchema>;

const DEFAULT_VALUES: WordCloudFormValues = {
  question: "",
  maxWordsPerParticipant: 1,
  maxWordLength: 30,
  allowMultipleSubmissions: false,
  profanityFilter: true,
};

export function WordCloudFormDialog({
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

  const form = useForm<WordCloudFormValues>({
    resolver: zodResolver(wordCloudFormSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const allowMultiple = form.watch("allowMultipleSubmissions");

  React.useEffect(() => {
    if (open) form.reset(DEFAULT_VALUES);
  }, [open, form]);

  async function onSubmit(values: WordCloudFormValues) {
    setIsSubmitting(true);
    try {
      const res = await messageService.createWordCloud(groupId, values);
      if (!res.success) throw new Error(res.error?.message || "Failed to create word cloud");
      toast.success("Word cloud posted");
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
          <DialogTitle>Create a word cloud</DialogTitle>
          <DialogDescription>
            Everyone submits a word or short phrase — matching entries merge live into one
            growing cloud.
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
                    <Input placeholder="What's one word for how you feel today?" autoFocus {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="allowMultipleSubmissions"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border border-input px-3 py-2.5">
                  <div className="space-y-0.5">
                    <FormLabel>Allow multiple words per person</FormLabel>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            {allowMultiple && (
              <FormField
                control={form.control}
                name="maxWordsPerParticipant"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max words per person</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={10}
                        {...field}
                        onChange={(e) => field.onChange(e.target.valueAsNumber)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="maxWordLength"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Max characters per word</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={10}
                      max={40}
                      {...field}
                      onChange={(e) => field.onChange(e.target.valueAsNumber)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="profanityFilter"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border border-input px-3 py-2.5">
                  <div className="space-y-0.5">
                    <FormLabel>Block inappropriate words</FormLabel>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="size-4 animate-spin" />}
                Post word cloud
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
