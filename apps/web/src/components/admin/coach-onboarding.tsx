"use client";

import * as React from "react";
import { KeyRound, Loader2, MailPlus, Pencil, Power, PowerOff } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type CoachApproval = {
  id: string;
  email: string;
  createdAt: string;
  claimedAt: string | null;
};

type CoachAccount = {
  id: string;
  name: string;
  email: string | null;
  isActive: boolean;
  disabledAt: string | null;
  createdAt: string;
};

type Feedback = { kind: "success" | "error"; message: string } | null;

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.error?.message || "The request could not be completed");
  }
  return result.data as T;
}

export function CoachOnboarding({
  approvals: initialApprovals,
  coaches: initialCoaches,
}: {
  approvals: CoachApproval[];
  coaches: CoachAccount[];
}) {
  const [approvals, setApprovals] = React.useState(initialApprovals);
  const [coaches, setCoaches] = React.useState(initialCoaches);
  const [isApproving, setIsApproving] = React.useState(false);
  const [editCoach, setEditCoach] = React.useState<CoachAccount | null>(null);
  const [passwordCoach, setPasswordCoach] = React.useState<CoachAccount | null>(null);
  const [statusCoach, setStatusCoach] = React.useState<CoachAccount | null>(null);
  const [pendingAction, setPendingAction] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<Feedback>(null);

  function replaceCoach(coach: CoachAccount) {
    setCoaches((current) => current.map((item) => (item.id === coach.id ? coach : item)));
  }

  function showFeedback(kind: "success" | "error", message: string) {
    setFeedback({ kind, message });
    if (kind === "success") toast.success(message);
    else toast.error(message);
  }

  async function approveCoach(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setIsApproving(true);
    setFeedback(null);
    try {
      const data = await requestJson<{ approval: CoachApproval }>("/api/v1/admin/coach-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: new FormData(form).get("email") }),
      });
      setApprovals((current) => [data.approval, ...current]);
      form.reset();
      showFeedback("success", "Coach email approved for signup");
    } catch (error) {
      showFeedback("error", error instanceof Error ? error.message : "Unable to approve email");
    } finally {
      setIsApproving(false);
    }
  }

  async function submitEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editCoach) return;
    const form = new FormData(event.currentTarget);
    setPendingAction(`edit:${editCoach.id}`);
    setFeedback(null);
    try {
      const data = await requestJson<{ coach: CoachAccount }>(
        `/api/v1/admin/coaches/${editCoach.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: form.get("name"), email: form.get("email") }),
        }
      );
      replaceCoach(data.coach);
      const priorEmail = editCoach.email?.toLowerCase();
      if (priorEmail && data.coach.email) {
        setApprovals((current) => current.map((approval) =>
          approval.claimedAt && approval.email.toLowerCase() === priorEmail
            ? { ...approval, email: data.coach.email! }
            : approval
        ));
      }
      setEditCoach(null);
      showFeedback("success", "Coach account updated");
    } catch (error) {
      showFeedback("error", error instanceof Error ? error.message : "Unable to update coach");
    } finally {
      setPendingAction(null);
    }
  }

  async function submitPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!passwordCoach) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    const confirmation = String(form.get("confirmPassword") || "");
    if (password !== confirmation) {
      showFeedback("error", "Passwords do not match");
      return;
    }

    setPendingAction(`password:${passwordCoach.id}`);
    setFeedback(null);
    try {
      await requestJson<{ message: string }>(`/api/v1/admin/coaches/${passwordCoach.id}/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      setPasswordCoach(null);
      showFeedback("success", "Coach password updated and existing sessions signed out");
    } catch (error) {
      showFeedback("error", error instanceof Error ? error.message : "Unable to update password");
    } finally {
      setPendingAction(null);
    }
  }

  async function changeActiveState() {
    if (!statusCoach) return;
    const activating = !statusCoach.isActive;
    setPendingAction(`status:${statusCoach.id}`);
    setFeedback(null);
    try {
      const data = await requestJson<{ coach: CoachAccount }>(
        `/api/v1/admin/coaches/${statusCoach.id}`,
        { method: activating ? "POST" : "DELETE" }
      );
      replaceCoach(data.coach);
      setStatusCoach(null);
      showFeedback("success", activating ? "Coach account reactivated" : "Coach account deactivated");
    } catch (error) {
      showFeedback("error", error instanceof Error ? error.message : "Unable to change coach access");
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <p className="mb-2 text-xs font-semibold tracking-[.14em] text-primary uppercase">Access management</p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Coach account management</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Approve coach signups, update account details, reset credentials, and manage access without deleting history.
        </p>
      </div>

      {feedback ? (
        <p
          role={feedback.kind === "error" ? "alert" : "status"}
          aria-live="polite"
          className={feedback.kind === "error" ? "text-sm text-destructive" : "text-sm text-emerald-700"}
        >
          {feedback.message}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Coach accounts</CardTitle>
          <CardDescription>Deactivated coaches stay linked to their groups, messages, and account history.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {coaches.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">No coach accounts have been created yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {coaches.map((coach) => (
                <div key={coach.id} className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-semibold">{coach.name}</p>
                      <Badge variant={coach.isActive ? "success" : "secondary"}>
                        {coach.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <p className="truncate text-sm text-muted-foreground">{coach.email ?? "No email"}</p>
                    {!coach.isActive && coach.disabledAt ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Deactivated {new Date(coach.disabledAt).toLocaleDateString()}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => setEditCoach(coach)} aria-label={`Edit coach ${coach.name}`}>
                      <Pencil /> Edit
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setPasswordCoach(coach)} aria-label={`Set new password for ${coach.name}`}>
                      <KeyRound /> Set password
                    </Button>
                    <Button
                      variant={coach.isActive ? "destructive" : "secondary"}
                      size="sm"
                      onClick={() => setStatusCoach(coach)}
                      aria-label={`${coach.isActive ? "Deactivate" : "Reactivate"} ${coach.name}`}
                    >
                      {coach.isActive ? <PowerOff /> : <Power />}
                      {coach.isActive ? "Deactivate" : "Reactivate"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Approve coach email</CardTitle>
          <CardDescription>The coach can use an approved email once at /coach/signup.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={approveCoach} className="flex flex-col gap-3 sm:flex-row">
            <Input name="email" type="email" required placeholder="coach@example.com" aria-label="Coach email" />
            <Button type="submit" disabled={isApproving} className="shrink-0">
              {isApproving ? <Loader2 className="size-4 animate-spin" /> : <MailPlus className="size-4" />}
              {isApproving ? "Approving..." : "Approve email"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Approved coach emails</CardTitle>
          <CardDescription>Track pending and completed coach signups.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {approvals.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">No coach emails have been approved yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {approvals.map((approval) => (
                <div key={approval.id} className="flex items-center justify-between gap-4 px-6 py-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{approval.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Approved {new Date(approval.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={approval.claimedAt ? "text-sm text-emerald-600" : "text-sm text-amber-600"}>
                    {approval.claimedAt ? "Account created" : "Awaiting signup"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(editCoach)} onOpenChange={(open) => !open && setEditCoach(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit coach account</DialogTitle>
            <DialogDescription>Changes apply to this coach account and its linked approval email.</DialogDescription>
          </DialogHeader>
          {editCoach ? (
            <form onSubmit={submitEdit} className="grid gap-4">
              <label className="grid gap-2 text-sm font-medium">
                Coach name
                <Input name="name" required minLength={2} maxLength={100} defaultValue={editCoach.name} />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Coach email
                <Input name="email" type="email" required defaultValue={editCoach.email ?? ""} />
              </label>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditCoach(null)}>Cancel</Button>
                <Button type="submit" disabled={pendingAction === `edit:${editCoach.id}`}>
                  {pendingAction === `edit:${editCoach.id}` ? "Saving..." : "Save changes"}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(passwordCoach)} onOpenChange={(open) => !open && setPasswordCoach(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set new password</DialogTitle>
            <DialogDescription>
              Set a strong password for {passwordCoach?.name}. Existing refresh tokens and active sessions will be revoked.
            </DialogDescription>
          </DialogHeader>
          {passwordCoach ? (
            <form onSubmit={submitPassword} className="grid gap-4">
              <label className="grid gap-2 text-sm font-medium">
                New password
                <Input type="password" name="password" required minLength={8} maxLength={128} autoComplete="new-password" />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Confirm new password
                <Input type="password" name="confirmPassword" required minLength={8} maxLength={128} autoComplete="new-password" />
              </label>
              <p className="text-xs text-muted-foreground">
                Use uppercase, lowercase, a number, and a special character.
              </p>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setPasswordCoach(null)}>Cancel</Button>
                <Button type="submit" disabled={pendingAction === `password:${passwordCoach.id}`}>
                  {pendingAction === `password:${passwordCoach.id}` ? "Updating..." : "Update password"}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(statusCoach)} onOpenChange={(open) => !open && setStatusCoach(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {statusCoach?.isActive ? `Deactivate ${statusCoach.name}?` : `Reactivate ${statusCoach?.name}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {statusCoach?.isActive
                ? "The coach will be signed out and unable to authenticate. Groups, messages, and history will be preserved."
                : "The coach can sign in again with the existing password. Revoked sessions will not be restored."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(pendingAction)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void changeActiveState();
              }}
              disabled={Boolean(pendingAction)}
            >
              {pendingAction
                ? statusCoach?.isActive ? "Deactivating..." : "Reactivating..."
                : statusCoach?.isActive ? "Confirm deactivation" : "Confirm reactivation"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
