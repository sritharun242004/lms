"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
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

export type RegistrationRow = {
  id: string;
  registrationCode: string;
  registrationKind: "INDIVIDUAL" | "COMPANY";
  fullName: string;
  email: string;
  whatsappNumber: string;
  designation: string;
  // Optional organisation an Individual registrant typed in.
  company: string | null;
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
  paymentMarkedDoneAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RegistrationSummary = {
  total: number;
  byStatus: Record<string, number>;
  paymentDoneRevenueInInr: number;
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "success"> = {
  PENDING_PAYMENT: "secondary",
  PAYMENT_DONE: "success",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: "Registered — Payment Pending",
  PAYMENT_DONE: "Payment Marked Done",
};

const STATUS_OPTIONS = ["PENDING_PAYMENT", "PAYMENT_DONE"];
const PACKAGE_OPTIONS = ["DAY1", "DAY2", "BOTH"];

const PACKAGE_LABEL: Record<RegistrationRow["workshopPackage"], string> = {
  DAY1: "Day 1",
  DAY2: "Day 2",
  BOTH: "Both days",
};

// A fixed locale and the workshop's time zone, so the server render and
// the browser print the same text (a bare toLocaleString() hydrates with a
// mismatch whenever the two disagree).
function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

// Day 2 alone is allowed without Day 1 (the form only warns), so the team
// needs to see who booked it that way.
function isDay2WithoutDay1(row: RegistrationRow) {
  return row.workshopPackage === "DAY2" && row.previousDay1Attendance !== true;
}

export function RegistrationsDashboard({
  registrations,
  summary,
}: {
  registrations: RegistrationRow[];
  summary: RegistrationSummary;
}) {
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("ALL");
  const [packageFilter, setPackageFilter] = React.useState("ALL");
  const [detailsTarget, setDetailsTarget] = React.useState<RegistrationRow | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<RegistrationRow | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const router = useRouter();

  async function deleteRegistration() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/v1/admin/registrations/${deleteTarget.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error?.message || "The registration could not be deleted");
      }
      toast.success(`Deleted ${deleteTarget.fullName}'s registration`);
      setDeleteTarget(null);
      // The list and the summary totals both come from the server render.
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The registration could not be deleted");
    } finally {
      setIsDeleting(false);
    }
  }

  const filtered = registrations.filter((row) => {
    if (statusFilter !== "ALL" && row.status !== statusFilter) return false;
    if (packageFilter !== "ALL" && row.workshopPackage !== packageFilter) return false;
    if (!search) return true;
    const needle = search.toLowerCase();
    return (
      row.fullName.toLowerCase().includes(needle) ||
      row.email.toLowerCase().includes(needle) ||
      row.registrationCode.toLowerCase().includes(needle) ||
      (row.companyName ?? "").toLowerCase().includes(needle)
    );
  });

  function exportUrl(format: "csv" | "xlsx") {
    const params = new URLSearchParams({ format });
    if (statusFilter !== "ALL") params.set("status", statusFilter);
    if (packageFilter !== "ALL") params.set("workshopPackage", packageFilter);
    return `/api/v1/admin/registrations/export?${params.toString()}`;
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <p className="mb-2 text-xs font-semibold tracking-[.14em] text-primary uppercase">Workshop registrations</p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">X Intelligence registrations</h1>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <SummaryCard label="Total" value={summary.total} />
        <SummaryCard label="Payment pending" value={summary.byStatus.PENDING_PAYMENT ?? 0} />
        <SummaryCard label="Payment marked done" value={summary.byStatus.PAYMENT_DONE ?? 0} />
        <SummaryCard label="Revenue (marked done)" value={`₹${summary.paymentDoneRevenueInInr.toLocaleString("en-IN")}`} />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by workshop package"
            value={packageFilter}
            onChange={(event) => setPackageFilter(event.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="ALL">All packages</option>
            {PACKAGE_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {PACKAGE_LABEL[p as RegistrationRow["workshopPackage"]]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={exportUrl("csv")}>Export CSV</a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={exportUrl("xlsx")}>Export Excel</a>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Registrations</CardTitle>
          <CardDescription>
            Participants mark their own payment as done. There is no payment verification step —
            follow up with them directly.
          </CardDescription>
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
                      <Badge variant={STATUS_VARIANT[row.status] ?? "secondary"}>{STATUS_LABEL[row.status] ?? row.status}</Badge>
                      <Badge variant="outline">{row.registrationKind === "COMPANY" ? "Company" : "Individual"}</Badge>
                      {isDay2WithoutDay1(row) ? <Badge variant="destructive">No Day 1 yet</Badge> : null}
                    </div>
                    <p className="text-sm break-words text-muted-foreground sm:truncate">
                      {row.registrationCode} · {PACKAGE_LABEL[row.workshopPackage]} · {row.email} · {row.whatsappNumber} · ₹{row.amountInInr.toLocaleString("en-IN")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.designation}
                      {row.registrationKind === "INDIVIDUAL" && row.company ? ` · ${row.company}` : ""} · Registered{" "}
                      {formatDateTime(row.createdAt)}
                    </p>
                    {row.registrationKind === "COMPANY" ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {row.companyName} · {row.companyAddress} · GSTIN {row.companyGstin}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setDetailsTarget(row)}>
                      View details
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => setDeleteTarget(row)}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && !isDeleting && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.fullName}&apos;s registration?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.registrationCode} · {deleteTarget?.email}
              {deleteTarget?.status === "PAYMENT_DONE" ? " · This person has marked their payment as done." : ""} This
              permanently removes the registration and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void deleteRegistration();
              }}
              disabled={isDeleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete registration"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
  return (
    <div className="flex flex-col gap-4">
      <DetailSection title="Participant information">
        <DetailField label="Full name" value={row.fullName} />
        <DetailField label="Email" value={row.email} />
        <DetailField label="WhatsApp number" value={row.whatsappNumber} />
        <DetailField label="Designation" value={row.designation} />
        <DetailField label="Company / organisation" value={row.registrationKind === "INDIVIDUAL" ? row.company : null} />
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
          value={
            row.previousDay1Attendance === null
              ? null
              : row.previousDay1Attendance
                ? row.previousDay1When
                  ? `Yes, ${row.previousDay1When}`
                  : "Yes"
                : "No"
          }
        />
        <DetailField label="Registered" value={formatDateTime(row.createdAt)} />
        <DetailField label="Status" value={STATUS_LABEL[row.status] ?? row.status} />
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
        <DetailField label="Payment Done clicked" value={row.paymentMarkedDoneAt ? "Yes" : "Not yet"} />
        <DetailField
          label="Payment confirmation timestamp"
          value={row.paymentMarkedDoneAt ? formatDateTime(row.paymentMarkedDoneAt) : null}
        />
        <DetailField label="Needs GST invoice" value={row.needsGstInvoice ? "Yes" : null} />
        <DetailField label="GST invoice company" value={row.gstCompanyName} />
        <DetailField label="GSTIN" value={row.gstin} />
      </DetailSection>
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
