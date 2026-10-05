"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, LogIn, MessagesSquare } from "lucide-react";
import { menteeJoinSchema, type MenteeJoinInput } from "@cms/shared";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const authInputClass = "h-12 sm:h-13 text-base sm:text-lg bg-white text-black placeholder:text-slate-500 dark:bg-white dark:text-black dark:placeholder:text-slate-500 rounded-2xl px-4.5";

export function ParticipantEntryForm({ standalone = false }: { standalone?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { join } = useAuth();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const form = useForm<MenteeJoinInput>({ resolver: zodResolver(menteeJoinSchema), defaultValues: { name: "", inviteCode: searchParams.get("code") ?? "" } });

  async function onSubmit(values: MenteeJoinInput) {
    setIsSubmitting(true);
    try {
      const { user, joinedGroup } = await join(values);
      toast.success(`Welcome, ${user.name.split(" ")[0]}. You joined ${joinedGroup.name}.`);
      router.push(`/chat/${joinedGroup.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That meeting code could not be used");
    } finally {
      setIsSubmitting(false);
    }
  }

  const formContent = (
    <div className="flex flex-col gap-6 sm:gap-7">
      <div className="flex flex-col gap-2.5 text-center">
        <p className="text-sm font-bold tracking-[.18em] text-primary uppercase">Participant portal</p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Let’s get started</h1>
        <p className="text-base sm:text-lg text-muted-foreground">Enter your name and meeting code to join.</p>
      </div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4 sm:gap-5">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-base font-semibold">Name</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Enter your name"
                    className={authInputClass}
                    autoComplete="name"
                    autoFocus
                    {...field}
                  />
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
                <FormLabel className="text-base font-semibold">Meeting or course code</FormLabel>
                <FormControl>
                  <Input
                    placeholder="CMS-A8KD"
                    className={`${authInputClass} uppercase`}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" size="lg" className="h-12 sm:h-13 w-full text-base sm:text-lg font-bold rounded-2xl" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="size-5 animate-spin" /> : <LogIn className="size-5" />}
            Enter meeting
          </Button>
        </form>
      </Form>
    </div>
  );

  if (!standalone) return formContent;
  return (
    <div className="relative h-svh w-full overflow-hidden text-foreground">
      <div className="pointer-events-none fixed -top-40 -right-32 size-[38rem] rounded-full bg-primary/20 blur-3xl -z-10" />
      <div className="pointer-events-none fixed -bottom-44 -left-36 size-[34rem] rounded-full bg-blue-300/40 blur-3xl -z-10" />
      <div className="relative z-10 grid h-full w-full md:grid-cols-2 lg:grid-cols-[1fr_1.05fr]">
        <section className="flex h-full flex-col justify-between p-6 sm:p-10 lg:p-12 overflow-y-auto md:overflow-hidden">
          <div>
            <Link href="/" className="inline-flex items-center gap-3.5 text-xl font-bold tracking-wide sm:text-2xl">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_10px_28px_rgba(37,99,235,.25)]">
                <MessagesSquare className="size-5" />
              </span>
              AI Empowerment
            </Link>
          </div>
          <div className="flex flex-1 items-center justify-center py-2 sm:py-4">
            <div className="glass w-full max-w-lg rounded-[2.25rem] p-7 sm:p-10 shadow-xl">
              {formContent}
            </div>
          </div>
          <div className="hidden md:block" />
        </section>
        <aside className="relative hidden md:flex flex-col justify-end h-full overflow-hidden bg-primary p-8 md:p-12 lg:p-20 text-primary-foreground">
          <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_center,white_1.5px,transparent_1.5px)] [background-size:40px_40px]" />
          <div className="relative max-w-2xl">
            <p className="text-base font-bold tracking-[.18em] uppercase text-primary-foreground/90">Participant Portal</p>
            <h2 className="mt-5 text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.12]">Interactive learning and collaborative growth.</h2>
            <p className="mt-6 text-xl sm:text-2xl text-primary-foreground/90 font-normal leading-relaxed">Connect directly with your mentors, coaches, and peer learning community in real time.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
