"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { createGroupSchema, type CreateGroupInput } from "@lms/shared";
import { groupService } from "@/lib/api/services/group-service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

interface GroupFormDialogProps {
  trigger: React.ReactNode;
  mode?: "create" | "edit";
  group?: { id: string; name: string; description: string | null };
  onSuccess: () => void;
}

export function GroupFormDialog({
  trigger,
  mode = "create",
  group,
  onSuccess,
}: GroupFormDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm<CreateGroupInput>({
    resolver: zodResolver(createGroupSchema),
    defaultValues: { name: group?.name ?? "", description: group?.description ?? "" },
  });

  React.useEffect(() => {
    if (open) {
      form.reset({ name: group?.name ?? "", description: group?.description ?? "" });
    }
  }, [open, group, form]);

  async function onSubmit(values: CreateGroupInput) {
    setIsSubmitting(true);
    try {
      if (mode === "edit" && group) {
        const res = await groupService.update(group.id, values);
        if (!res.success) throw new Error(res.error?.message || "Failed to update group");
        toast.success("Group updated");
      } else {
        const res = await groupService.create(values);
        if (!res.success) throw new Error(res.error?.message || "Failed to create group");
        toast.success(`"${res.data!.name}" created`);
      }
      setOpen(false);
      onSuccess();
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
          <DialogTitle>{mode === "edit" ? "Edit group" : "Create a group"}</DialogTitle>
          <DialogDescription>
            {mode === "edit"
              ? "Update the name and description your mentees see."
              : "Give your group a name — you'll get a shareable invite code right after."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Group name</FormLabel>
                  <FormControl>
                    <Input placeholder="React Mastery 2026" autoFocus {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="What is this group about?"
                      rows={3}
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
                {mode === "edit" ? "Save changes" : "Create group"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
