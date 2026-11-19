"use client";

import * as React from "react";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";

export type RegistrationRow = {
  id: string;
  registrationCode: string;
  fullName: string;
  email: string;
  workshopPackage: "DAY1" | "DAY2" | "BOTH";
  amountInInr: number;
  status: string;
  paymentProofs: { id: string; mimeType: string; submittedAt: string }[];
};

export type RegistrationSummary = {
  total: number;
  byStatus: Record<string, number>;
  approvedRevenueInInr: number;
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "success"> = {
  PENDING_PAYMENT: "secondary",
  PROOF_SUBMITTED: "default",
  UNDER_VERIFICATION: "default",
  APPROVED: "success",
  REJECTED: "destructive",
  RESUBMISSION_REQUESTED: "secondary",
};

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.error?.message || "The request could not be completed");
  }
  return result.data as T;
}

export function RegistrationsDashboard({
  registrations: initialRegistrations,
  summary,
}: {
  registrations: RegistrationRow[];
  summary: RegistrationSummary;
}) {
  const [registrations, setRegistrations] = React.useState(initialRegistrations);
  const [actionTarget, setActionTarget] = React.useState<{ row: RegistrationRow; action: "APPROVE" | "REJECT" | "REQUEST_RESUBMISSION" } | null>(null);
  const [note, setNote] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [isPending, setIsPending] = React.useState(false);

  function replaceRegistration(id: string, patch: Partial<RegistrationRow>) {
    setRegistrations((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  async function runAction() {
    if (!actionTarget) return;
    setIsPending(true);
    try {
      const data = await requestJson<{ registration: { status: string } }>(
        `/api/v1/admin/registrations/${actionTarget.row.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: actionTarget.action, note }),
        }
      );
      replaceRegistration(actionTarget.row.id, { status: data.registration.status });
      toast.success("Registration updated");
      setActionTarget(null);
      setNote("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update registration");
    } finally {
      setIsPending(false);
    }
  }

  const filtered = registrations.filter((row) => {
    if (!search) return true;
    const needle = search.toLowerCase();
    return (
      row.fullName.toLowerCase().includes(needle) ||
      row.email.toLowerCase().includes(needle) ||
      row.registrationCode.toLowerCase().includes(needle)
    );
  });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <p className="mb-2 text-xs font-semibold tracking-[.14em] text-primary uppercase">Workshop registrations</p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">X Intelligence registrations</h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryCard label="Total" value={summary.total} />
        <SummaryCard label="Awaiting proof" value={summary.byStatus.PENDING_PAYMENT ?? 0} />
        <SummaryCard label="Awaiting verification" value={summary.byStatus.PROOF_SUBMITTED ?? 0} />
        <SummaryCard label="Approved" value={summary.byStatus.APPROVED ?? 0} />
        <SummaryCard label="Rejected" value={summary.byStatus.REJECTED ?? 0} />
        <SummaryCard label="Revenue" value={`₹${summary.approvedRevenueInInr.toLocaleString("en-IN")}`} />
      </div>

      <Input
        placeholder="Search by name, email, or registration code"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className="max-w-md"
      />

      <Card>
        <CardHeader>
          <CardTitle>Registrations</CardTitle>
          <CardDescription>Review payment proofs and approve, reject, or request resubmission.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">No registrations match.</p>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((row) => (
                <div key={row.id} className="flex flex-col gap-3 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-semibold">{row.fullName}</p>
                      <Badge variant={STATUS_VARIANT[row.status] ?? "secondary"}>{row.status}</Badge>
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {row.registrationCode} · {row.email} · ₹{row.amountInInr.toLocaleString("en-IN")}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {row.paymentProofs[0] ? (
                      <Button asChild variant="outline" size="sm">
                        <a href={`/api/v1/admin/registrations/${row.id}/payment-proof`} target="_blank" rel="noreferrer">
                          View proof
                        </a>
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      disabled={row.status !== "PROOF_SUBMITTED" && row.status !== "UNDER_VERIFICATION"}
                      onClick={() => setActionTarget({ row, action: "APPROVE" })}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={row.status !== "PROOF_SUBMITTED" && row.status !== "UNDER_VERIFICATION"}
                      onClick={() => setActionTarget({ row, action: "REJECT" })}
                    >
                      Reject
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={row.status !== "PROOF_SUBMITTED" && row.status !== "UNDER_VERIFICATION"}
                      onClick={() => setActionTarget({ row, action: "REQUEST_RESUBMISSION" })}
                    >
                      Request resubmission
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(actionTarget)} onOpenChange={(open) => !open && setActionTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionTarget?.action === "APPROVE"
                ? `Approve ${actionTarget.row.fullName}?`
                : actionTarget?.action === "REJECT"
                  ? `Reject ${actionTarget.row.fullName}?`
                  : `Request resubmission from ${actionTarget?.row.fullName}?`}
            </DialogTitle>
            <DialogDescription>
              {actionTarget?.action === "APPROVE"
                ? "This creates or activates their participant account and adds them to the workshop group."
                : "An optional note is kept in the verification log."}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Internal note (optional)"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionTarget(null)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={runAction} disabled={isPending}>
              {isPending ? "Saving..." : actionTarget?.action === "APPROVE" ? "Confirm approval" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
