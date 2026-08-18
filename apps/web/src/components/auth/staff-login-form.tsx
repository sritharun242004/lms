"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { z } from "zod";
import { loginSchema, type LoginInput } from "@cms/shared";
import { useAuth } from "@/providers/auth-provider";
import {
  portalForRole,
  safePortalDestination,
} from "@/lib/auth/portal-navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const authInputClass = "bg-white text-black placeholder:text-slate-500 dark:bg-white dark:text-black dark:placeholder:text-slate-500";

export function StaffLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const form = useForm<z.input<typeof loginSchema>, unknown, LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", rememberMe: false },
  });

  async function onSubmit(values: LoginInput) {
    setIsSubmitting(true);
    try {
      const user = await login(values);
      toast.success(`Welcome back, ${user.name.split(" ")[0]}!`);
      router.push(safePortalDestination(portalForRole(user.role), searchParams.get("redirect")));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Staff sign in</h1>
        <p className="text-sm text-muted-foreground">Coach or Super Admin? Use your approved email and password.</p>
      </div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <FormField control={form.control} name="email" render={({ field }) => (
            <FormItem><FormLabel>Email</FormLabel><FormControl><Input className={authInputClass} type="email" placeholder="you@example.com" autoComplete="email" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="password" render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between"><FormLabel>Password</FormLabel><Link href="/forgot-password?portal=admin" className="text-sm text-muted-foreground hover:text-foreground">Forgot password?</Link></div>
              <FormControl><PasswordInput className={authInputClass} placeholder="••••••••" autoComplete="current-password" {...field} /></FormControl><FormMessage />
            </FormItem>
          )} />
          <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting && <Loader2 className="size-4 animate-spin" />}Sign in</Button>
        </form>
      </Form>
      <p className="text-center text-sm text-muted-foreground">Approved as a coach? <Link href="/coach/signup" className="font-medium text-foreground underline underline-offset-4">Create your coach account</Link></p>
    </div>
  );
}
