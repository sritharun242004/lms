"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, ArrowLeft, Loader2 } from "lucide-react";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@cms/shared";
import { authService } from "@/lib/api/services/auth-service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { canonicalLoginPath, parseAuthPortal } from "@/lib/auth/portal-navigation";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

export default function ForgotPasswordPage() {
  return <React.Suspense fallback={null}><ForgotPasswordForm /></React.Suspense>;
}

function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const portal = parseAuthPortal(searchParams.get("portal"));
  const loginPath = canonicalLoginPath(portal);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [serviceError, setServiceError] = React.useState<string | null>(null);

  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: ForgotPasswordInput) {
    setIsSubmitting(true);
    setServiceError(null);
    try {
      const result = await authService.forgotPassword(values, portal);
      if (!result.success) {
        setServiceError(result.error?.message || "Password recovery is currently unavailable.");
        return;
      }
      setSubmitted(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <CheckCircle2 className="size-10 text-success" />
        <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
        <p className="text-sm text-muted-foreground">
          If an account exists for <strong>{form.getValues("email")}</strong>, we&apos;ve
          sent a link to reset your password. It expires in 1 hour.
        </p>
        <Link href={loginPath} className="text-sm font-medium underline underline-offset-4">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Forgot your password?</h1>
        <p className="text-sm text-muted-foreground">
          Enter your email and we&apos;ll send you a reset link
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="you@example.com" autoComplete="email" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            Send reset link
          </Button>
        </form>
      </Form>

      {serviceError ? <p role="alert" className="text-sm text-destructive">{serviceError}</p> : null}

      <Link
        href={loginPath}
        className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Back to sign in
      </Link>
    </div>
  );
}
