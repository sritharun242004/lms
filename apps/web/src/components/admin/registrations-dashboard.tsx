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
  admin: { name: string | null; email: string } | null;
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
  previousDay1Attendance: boolean | null;
  previousDay1When: string | null;
  aiExperienceLevel: "NEW" | "SOMETIMES" | "DAILY";
  aiUseCase: string | null;
  subscriptions: string[];
  needsGstInvoice: boolean;
  gstCompanyName: string | null;
  gstin: string | null;
  referredBy: string | null;
  amountInInr: number;
  status: string;
  whatsappGroupId: string | null;
  whatsappGroupName: string | null;
  whatsappGroupInviteUrl: string | null;
  createdAt: string;
  updatedAt: string;
  paymentProofs: { id: string; mimeType: string; submittedAt: string }[];
  verificationLogs: VerificationLogRow[];
};

export type RegistrationSummary = {
  total: number;
  byStatus: Record<string, number>;
  approvedRevenueInInr: number;
};

type ActiveGroupOption = { id: string; name: string };

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "success"> = {
  PENDING_PAYMENT: "secondary",
  PROOF_SUBMITTED: "default",
  UNDER_VERIFICATION: "default",
  APPROVED: "success",
  REJECTED: "destructive",
  RESUBMISSION_REQUESTED: "secondary",
};

const STATUS_OPTIONS = [
  "PENDING_PAYMENT",
  "PROOF_SUBMITTED",
  "UNDER_VERIFICATION",
  "APPROVED",
  "REJECTED",
  "RESUBMISSION_REQUESTED",
];

const PACKAGE_LABEL: Record<RegistrationRow["workshopPackage"], string> = {
  DAY1: "Day 1",
  DAY2: "Day 2",
  BOTH: "Both days",
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.error?.message || "The request could not be completed");
  }
  return result.data as T;
}

function approverLabel(log: VerificationLogRow): string {
  if (log.admin?.name) return log.admin.name;
  if (log.admin?.email) return log.admin.email;
  return log.adminId;
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
  const [selectedGroupId, setSelectedGroupId] = React.useState("");
  const [activeGroups, setActiveGroups] = React.useState<ActiveGroupOption[]>([]);
  const [groupsLoading, setGroupsLoading] = React.useState(false);
  const [allowMissingWhatsappLink, setAllowMissingWhatsappLink] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("ALL");
  const [isPending, setIsPending] = React.useState(false);
  const [detailsTarget, setDetailsTarget] = React.useState<RegistrationRow | null>(null);

  function replaceRegistration(id: string, patch: Partial<RegistrationRow>) {
    setRegistrations((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function openAction(row: RegistrationRow, action: "APPROVE" | "REJECT" | "REQUEST_RESUBMISSION") {
    setActionTarget({ row, action });
    setNote("");
    setSelectedGroupId("");
    setAllowMissingWhatsappLink(false);
    if (action === "APPROVE") {
      setGroupsLoading(true);
      requestJson<{ groups: Array<{ id: string; name: string; isActive: boolean }> }>("/api/v1/admin/whatsapp-groups")
        .then((data) => setActiveGroups(data.groups.filter((g) => g.isActive).map((g) => ({ id: g.id, name: g.name }))))
        .catch(() => toast.error("Unable to load WhatsApp groups"))
        .finally(() => setGroupsLoading(false));
    }
  }

  async function runAction() {
    if (!actionTarget) return;
    setIsPending(true);
    try {
      const body: Record<string, unknown> = { action: actionTarget.action, note };
      if (actionTarget.action === "APPROVE") {
        body.whatsappGroupId = selectedGroupId || undefined;
        body.allowMissingWhatsappLink = allowMissingWhatsappLink;
      }
      const data = await requestJson<{
        registration: {
          status: string;
          whatsappGroupId: string | null;
          whatsappGroupName: string | null;
          whatsappGroupInviteUrl: string | null;
        };
      }>(`/api/v1/admin/registrations/${actionTarget.row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      replaceRegistration(actionTarget.row.id, {
        status: data.registration.status,
        whatsappGroupId: data.registration.whatsappGroupId,
        whatsappGroupName: data.registration.whatsappGroupName,
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
    if (statusFilter !== "ALL" && row.status !== statusFilter) return false;
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

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder="Search by name, email, registration code, or company"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="max-w-md"
        />
        <select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="ALL">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

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
                        Group: {row.whatsappGroupName ?? "—"} ({row.whatsappGroupInviteUrl})
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setDetailsTarget(row)}>
                      View details
                    </Button>
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
              <label className="text-sm font-medium" htmlFor="whatsapp-group-select">
                WhatsApp group
              </label>
              <select
                id="whatsapp-group-select"
                value={selectedGroupId}
                onChange={(event) => setSelectedGroupId(event.target.value)}
                disabled={allowMissingWhatsappLink || groupsLoading}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">{groupsLoading ? "Loading groups…" : "Select a group"}</option>
                {activeGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
              {!groupsLoading && activeGroups.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No active WhatsApp groups yet. Add one in WhatsApp groups below, or use the exception.
                </p>
              ) : null}
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Checkbox
                  checked={allowMissingWhatsappLink}
                  onCheckedChange={(checked) => setAllowMissingWhatsappLink(checked === true)}
                />
                Approve without a group (exception — assign it later)
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
            <Button
              onClick={runAction}
              disabled={
                isPending ||
                (actionTarget?.action === "APPROVE" && !selectedGroupId && !allowMissingWhatsappLink)
              }
            >
              {isPending ? "Saving..." : actionTarget?.action === "APPROVE" ? "Confirm approval" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(detailsTarget)} onOpenChange={(open) => !open && setDetailsTarget(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detailsTarget?.fullName}</DialogTitle>
            <DialogDescription>{detailsTarget?.registrationCode}</DialogDescription>
          </DialogHeader>
          {detailsTarget ? <RegistrationDetails row={detailsTarget} /> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsTarget(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function RegistrationDetails({ row }: { row: RegistrationRow }) {
  const latestApproval = row.verificationLogs.find((log) => log.action === "APPROVED");

  return (
    <div className="flex flex-col gap-4">
      <DetailSection title="Participant information">
        <DetailField label="Full name" value={row.fullName} />
        <DetailField label="Email" value={row.email} />
        <DetailField label="WhatsApp number" value={row.whatsappNumber} />
        <DetailField label="Designation" value={row.designation} />
        <DetailField label="AI experience level" value={row.aiExperienceLevel} />
        <DetailField label="AI use case" value={row.aiUseCase} />
        <DetailField label="Subscriptions" value={row.subscriptions.length > 0 ? row.subscriptions.join(", ") : null} />
        <DetailField label="Referred by" value={row.referredBy} />
      </DetailSection>

      <DetailSection title="Registration information">
        <DetailField label="Registration ID" value={row.registrationCode} />
        <DetailField label="Type" value={row.registrationKind === "COMPANY" ? "Company" : "Individual"} />
        <DetailField label="Package" value={PACKAGE_LABEL[row.workshopPackage]} />
        <DetailField
          label="Prior Day 1 attendance"
          value={row.previousDay1Attendance === null ? null : row.previousDay1Attendance ? `Yes — ${row.previousDay1When ?? ""}` : "No"}
        />
        <DetailField label="Registered" value={new Date(row.createdAt).toLocaleString()} />
        <DetailField label="Status" value={row.status} />
      </DetailSection>

      {row.registrationKind === "COMPANY" ? (
        <DetailSection title="Company information">
          <DetailField label="Company name" value={row.companyName} />
          <DetailField label="Company address" value={row.companyAddress} />
          <DetailField label="Company GSTIN" value={row.companyGstin} />
        </DetailSection>
      ) : null}

      <DetailSection title="Payment information">
        <DetailField label="Amount" value={`₹${row.amountInInr.toLocaleString("en-IN")}`} />
        <DetailField label="Status" value={row.status} />
        <DetailField
          label="Payment proof"
          value={
            row.paymentProofs[0] ? (
              <a
                className="text-primary underline"
                href={`/api/v1/admin/registrations/${row.id}/payment-proof`}
                target="_blank"
                rel="noreferrer"
              >
                View screenshot
              </a>
            ) : (
              "Not submitted"
            )
          }
        />
        <DetailField label="Submitted" value={row.paymentProofs[0] ? new Date(row.paymentProofs[0].submittedAt).toLocaleString() : null} />
        <DetailField label="Needs GST invoice" value={row.needsGstInvoice ? "Yes" : null} />
        <DetailField label="GST invoice company" value={row.gstCompanyName} />
        <DetailField label="GSTIN" value={row.gstin} />
      </DetailSection>

      <DetailSection title="WhatsApp information">
        <DetailField label="Assigned group" value={row.whatsappGroupName} />
        <DetailField label="Invite link" value={row.whatsappGroupInviteUrl} />
        <DetailField label="Assigned on" value={latestApproval ? new Date(latestApproval.createdAt).toLocaleString() : null} />
        <DetailField label="Approved by" value={latestApproval ? approverLabel(latestApproval) : null} />
      </DetailSection>

      {row.verificationLogs.length > 0 ? (
        <DetailSection title="Verification history">
          <div className="sm:col-span-2">
            <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
              {row.verificationLogs.map((log) => (
                <li key={log.id}>
                  {log.action} by {approverLabel(log)} — {new Date(log.createdAt).toLocaleString()}
                  {log.note ? `: ${log.note}` : ""}
                </li>
              ))}
            </ul>
          </div>
        </DetailSection>
      ) : null}
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
