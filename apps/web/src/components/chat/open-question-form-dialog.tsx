"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { createOpenQuestionSchema, type CreateOpenQuestionInput } from "@cms/shared";
import type { ChatMessage } from "@/lib/api/services/message-service";
import { messageService } from "@/lib/api/services/message-service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export function OpenQuestionFormDialog({
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

  const form = useForm<CreateOpenQuestionInput>({
    resolver: zodResolver(createOpenQuestionSchema),
    defaultValues: { question: "" },
  });

  React.useEffect(() => {
    if (open) form.reset({ question: "" });
  }, [open, form]);

  async function onSubmit(values: CreateOpenQuestionInput) {
    setIsSubmitting(true);
    try {
      const res = await messageService.createOpenQuestion(groupId, values);
      if (!res.success) throw new Error(res.error?.message || "Failed to post question");
      toast.success("Question posted");
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ask an open-ended question</DialogTitle>
          <DialogDescription>
            Everyone in the group can type a short answer — answers stack up live as they come
            in, anonymously.
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
                    <Input
                      placeholder="Summarize today's lecture in one word"
                      autoFocus
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="size-4 animate-spin" />}
                Post question
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
