"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";

export default function CoachSignupPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setIsSubmitting(true);
    try {
      const response = await fetch("/api/v1/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error?.message || "Unable to create account");
      toast.success("Participant account created. Welcome to CMS!"); router.push("/mentor/dashboard"); router.refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to create account"); } finally { setIsSubmitting(false); }
  }
  return <div className="flex flex-col gap-6"><div className="flex flex-col gap-2 text-center"><h1 className="text-2xl font-semibold tracking-tight">Create participant account</h1><p className="text-sm text-muted-foreground">Use the email approved by your Super Admin.</p></div><form onSubmit={onSubmit} className="flex flex-col gap-4"><label className="flex flex-col gap-2 text-sm font-medium">Name<Input name="name" required minLength={2} autoComplete="name" placeholder="Your name" /></label><label className="flex flex-col gap-2 text-sm font-medium">Email<Input name="email" type="email" required autoComplete="email" placeholder="you@example.com" /></label><label className="flex flex-col gap-2 text-sm font-medium">Password<PasswordInput name="password" required autoComplete="new-password" placeholder="Create a secure password" /></label><label className="flex flex-col gap-2 text-sm font-medium">Confirm password<PasswordInput name="confirmPassword" required autoComplete="new-password" placeholder="Repeat your password" /></label><Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting && <Loader2 className="size-4 animate-spin" />}Create account</Button></form><p className="text-center text-sm text-muted-foreground">Already have an account? <Link href="/login" className="font-medium text-foreground underline underline-offset-4">Sign in</Link></p></div>;
}
