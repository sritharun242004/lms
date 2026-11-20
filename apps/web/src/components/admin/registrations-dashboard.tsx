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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export type VerificationLogRow = {
  id: string;
  action: string;
  note: string | null;
  createdAt: string;
  adminId: string;
};

export type RegistrationRow = {
  id: string;
  registrationCode: string;
  registrationKind: "INDIVIDUAL" | "COMPANY";
  fullName: string;
  email: string;
  whatsappNumber: string;
  designation: string;
  companyName: string | null;
  companyAddress: string | null;
  companyGstin: string | null;
  workshopPackage: "DAY1" | "DAY2" | "BOTH";
  amountInInr: number;
  status: string;
  whatsappGroupInviteUrl: string | null;
  createdAt: string;
  paymentProofs: { id: string; mimeType: string; submittedAt: string }[];
  verificationLogs: VerificationLogRow[];
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

const PACKAGE_LABEL: Record<RegistrationRow["workshopPackage"], string> = {
  DAY1: "Day 1",
  DAY2: "Day 2",
  BOTH: "Both days",
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
  const [whatsappGroupInviteUrl, setWhatsappGroupInviteUrl] = React.useState("");
  const [allowMissingWhatsappLink, setAllowMissingWhatsappLink] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [isPending, setIsPending] = React.useState(false);

  function replaceRegistration(id: string, patch: Partial<RegistrationRow>) {
    setRegistrations((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function openAction(row: RegistrationRow, action: "APPROVE" | "REJECT" | "REQUEST_RESUBMISSION") {
    setActionTarget({ row, action });
    setNote("");
    setWhatsappGroupInviteUrl(row.whatsappGroupInviteUrl ?? "");
    setAllowMissingWhatsappLink(false);
  }

  async function runAction() {
    if (!actionTarget) return;
    setIsPending(true);
    try {
      const body: Record<string, unknown> = { action: actionTarget.action, note };
      if (actionTarget.action === "APPROVE") {
        body.whatsappGroupInviteUrl = whatsappGroupInviteUrl.trim() || undefined;
        body.allowMissingWhatsappLink = allowMissingWhatsappLink;
      }
      const data = await requestJson<{ registration: { status: string; whatsappGroupInviteUrl: string | null } }>(
        `/api/v1/admin/registrations/${actionTarget.row.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      replaceRegistration(actionTarget.row.id, {
        status: data.registration.status,
        whatsappGroupInviteUrl: data.registration.whatsappGroupInviteUrl,
      });
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
      row.registrationCode.toLowerCase().includes(needle) ||
      (row.companyName ?? "").toLowerCase().includes(needle)
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
        placeholder="Search by name, email, registration code, or company"
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
                <div key={row.id} className="flex flex-col gap-3 px-6 py-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-semibold">{row.fullName}</p>
                      <Badge variant={STATUS_VARIANT[row.status] ?? "secondary"}>{row.status}</Badge>
                      <Badge variant="outline">{row.registrationKind === "COMPANY" ? "Company" : "Individual"}</Badge>
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {row.registrationCode} · {PACKAGE_LABEL[row.workshopPackage]} · {row.email} · {row.whatsappNumber} · ₹{row.amountInInr.toLocaleString("en-IN")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.designation} · Registered {new Date(row.createdAt).toLocaleString()}
                    </p>
                    {row.registrationKind === "COMPANY" ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {row.companyName} · {row.companyAddress} · GSTIN {row.companyGstin}
                      </p>
                    ) : null}
                    {row.whatsappGroupInviteUrl ? (
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        Group link: {row.whatsappGroupInviteUrl}
                      </p>
                    ) : null}
                    {row.verificationLogs.length > 0 ? (
                      <details className="mt-2 text-xs text-muted-foreground">
                        <summary className="cursor-pointer">Verification history ({row.verificationLogs.length})</summary>
                        <ul className="mt-1 flex flex-col gap-1 pl-3">
                          {row.verificationLogs.map((log) => (
                            <li key={log.id}>
                              {log.action} — {new Date(log.createdAt).toLocaleString()}
                              {log.note ? `: ${log.note}` : ""}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
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
                      onClick={() => openAction(row, "APPROVE")}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={row.status !== "PROOF_SUBMITTED" && row.status !== "UNDER_VERIFICATION"}
                      onClick={() => openAction(row, "REJECT")}
                    >
                      Reject
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={row.status !== "PROOF_SUBMITTED" && row.status !== "UNDER_VERIFICATION"}
                      onClick={() => openAction(row, "REQUEST_RESUBMISSION")}
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
                ? "This marks the payment approved on this independent registration record. It does not create or touch any LMS/CMS account."
                : "An optional note is kept in the verification log."}
            </DialogDescription>
          </DialogHeader>

          {actionTarget?.action === "APPROVE" ? (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="whatsapp-group-url">
                WhatsApp group invitation link
              </label>
              <Input
                id="whatsapp-group-url"
                placeholder="https://chat.whatsapp.com/..."
                value={whatsappGroupInviteUrl}
                onChange={(event) => setWhatsappGroupInviteUrl(event.target.value)}
                disabled={allowMissingWhatsappLink}
              />
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Checkbox
                  checked={allowMissingWhatsappLink}
                  onCheckedChange={(checked) => setAllowMissingWhatsappLink(checked === true)}
                />
                Approve without a group link (exception — add it later)
              </label>
            </div>
          ) : null}

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
