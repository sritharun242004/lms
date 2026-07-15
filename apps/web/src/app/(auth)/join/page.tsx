"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { menteeJoinSchema, type MenteeJoinInput } from "@cms/shared";
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

export default function JoinPage() {
  return (
    <React.Suspense fallback={null}>
      <JoinForm />
    </React.Suspense>
  );
}

function JoinForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { join } = useAuth();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm<MenteeJoinInput>({
    resolver: zodResolver(menteeJoinSchema),
    defaultValues: { name: "", inviteCode: searchParams.get("code") ?? "" },
  });

  async function onSubmit(values: MenteeJoinInput) {
    setIsSubmitting(true);
    try {
      const { user, joinedGroup } = await join(values);
      toast.success(`Welcome, ${user.name.split(" ")[0]}! You've joined ${joinedGroup.name}.`);
      router.push(`/chat/${joinedGroup.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't join that group");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Join a group</h1>
        <p className="text-sm text-muted-foreground">
          Just your name and the invite code your mentor shared — no account needed
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Your name</FormLabel>
                <FormControl>
                  <Input placeholder="Jane Doe" autoComplete="name" autoFocus {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="inviteCode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Invite code</FormLabel>
                <FormControl>
                  <Input placeholder="CMS-A8KD" className="uppercase" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            Join group
          </Button>
        </form>
      </Form>

      <p className="text-center text-sm text-muted-foreground">
        Are you a mentor?{" "}
        <Link href="/signup" className="font-medium text-foreground underline underline-offset-4">
          Create a mentor account
        </Link>
      </p>
    </div>
  );
}
