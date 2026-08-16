"use client";

import * as React from "react";
import { Loader2, MailPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
type CoachApproval = { id: string; email: string; createdAt: string; claimedAt: string | null };
export function CoachOnboarding({ approvals }: { approvals: CoachApproval[] }) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  async function approveCoach(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setIsSubmitting(true);
    try {
      const response = await fetch("/api/v1/admin/coach-onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: new FormData(event.currentTarget).get("email") }) });
      const result = await response.json(); if (!response.ok || !result.success) throw new Error(result.error?.message || "Unable to approve email");
      toast.success("Coach email approved for signup"); event.currentTarget.reset(); window.location.reload();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to approve email"); } finally { setIsSubmitting(false); }
  }
  return <div className="mx-auto flex max-w-4xl flex-col gap-6"><div><p className="mb-2 text-xs font-semibold tracking-[.14em] text-primary uppercase">Access management</p><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Coach onboarding</h1><p className="mt-2 text-sm text-muted-foreground">Approve a coach email before it can create a CMS account.</p></div><Card><CardHeader><CardTitle>Approve coach email</CardTitle><CardDescription>The coach can use this email once to create their account and will stay signed in for 30 days.</CardDescription></CardHeader><CardContent><form onSubmit={approveCoach} className="flex flex-col gap-3 sm:flex-row"><Input name="email" type="email" required placeholder="coach@example.com" aria-label="Coach email" /><Button type="submit" disabled={isSubmitting} className="shrink-0">{isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <MailPlus className="size-4" />}Approve email</Button></form></CardContent></Card><Card><CardHeader><CardTitle>Approved coach emails</CardTitle><CardDescription>Track pending and completed coach signups.</CardDescription></CardHeader><CardContent className="p-0">{approvals.length === 0 ? <p className="px-6 pb-6 text-sm text-muted-foreground">No coach emails have been approved yet.</p> : <div className="divide-y divide-border">{approvals.map((approval) => <div key={approval.id} className="flex items-center justify-between gap-4 px-6 py-4"><div className="min-w-0"><p className="truncate text-sm font-medium">{approval.email}</p><p className="text-xs text-muted-foreground">Approved {new Date(approval.createdAt).toLocaleDateString()}</p></div><span className={approval.claimedAt ? "text-sm text-emerald-600" : "text-sm text-amber-600"}>{approval.claimedAt ? "Account created" : "Awaiting signup"}</span></div>)}</div>}</CardContent></Card></div>;
}
