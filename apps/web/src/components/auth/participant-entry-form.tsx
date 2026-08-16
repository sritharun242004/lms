"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, LogIn } from "lucide-react";
import { menteeJoinSchema, type MenteeJoinInput } from "@cms/shared";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { BrandLogo } from "@/components/layout/brand-logo";

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
    <div className="flex flex-col gap-6">
      <div className="text-center"><p className="text-xs font-semibold tracking-[.15em] text-primary uppercase">Participant portal</p><h1 className="mt-3 text-3xl font-bold tracking-tight">Enter your meeting</h1></div>
      <Form {...form}><form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <FormField control={form.control} name="name" render={({ field }) => <FormItem><FormLabel>Name</FormLabel><FormControl><Input placeholder="Enter your name" autoComplete="name" autoFocus {...field} /></FormControl><FormMessage /></FormItem>} />
        <FormField control={form.control} name="inviteCode" render={({ field }) => <FormItem><FormLabel>Meeting or course code</FormLabel><FormControl><Input placeholder="CMS-A8KD" className="uppercase" {...field} /></FormControl><FormMessage /></FormItem>} />
        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>{isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}Enter meeting</Button>
      </form></Form>
      <Link href="/login" className="text-center text-sm text-muted-foreground underline-offset-4 hover:text-primary hover:underline">Staff sign in</Link>
    </div>
  );

  if (!standalone) return formContent;
  return <div className="relative flex min-h-svh items-center justify-center overflow-hidden p-5"><div className="ambient-orb -top-40 -right-28 size-[36rem] bg-primary/25" /><div className="ambient-orb -bottom-40 -left-28 size-[32rem] bg-brand-200/70" /><main className="glass relative z-10 w-full max-w-md rounded-[2rem] p-7 sm:p-9"><Link href="/" aria-label="CMS AI Empowerment home" className="mb-10 flex justify-center"><BrandLogo priority className="w-44 shadow-[0_10px_28px_rgba(71,102,75,.18)]" /></Link>{formContent}</main></div>;
}
