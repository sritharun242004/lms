"use client";

import * as React from "react";
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

type Submission = {
  responseId: string;
  formId: string;
  formTitle: string;
  submittedAt: string;
  anonymous: boolean;
  respondentName: string | null;
  respondentEmail: string | null;
  answers: { questionId: string; questionTitle: string; value: string }[];
};

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const result = await response.json();
  if (!result.success) throw new Error(result.error?.message ?? "Request failed");
  return result.data as T;
}

export function FeedbackSubmissionsTable() {
  const [submissions, setSubmissions] = React.useState<Submission[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [formFilter, setFormFilter] = React.useState("ALL");
  const [detailsTarget, setDetailsTarget] = React.useState<Submission | null>(null);

  React.useEffect(() => {
    fetchJson<{ submissions: Submission[] }>("/api/v1/admin/feedback/submissions")
      .then((data) => setSubmissions(data.submissions))
      .finally(() => setIsLoading(false));
  }, []);

  const forms = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of submissions) seen.set(s.formId, s.formTitle);
    return Array.from(seen, ([id, title]) => ({ id, title }));
  }, [submissions]);

  const filtered = submissions.filter((s) => {
    if (formFilter !== "ALL" && s.formId !== formFilter) return false;
    if (!search) return true;
    const needle = search.toLowerCase();
    return (
      s.formTitle.toLowerCase().includes(needle) ||
      (s.respondentName ?? "").toLowerCase().includes(needle) ||
      (s.respondentEmail ?? "").toLowerCase().includes(needle)
    );
  });

  function exportUrl(format: "csv" | "xlsx") {
    const params = new URLSearchParams({ format });
    if (formFilter !== "ALL") params.set("formId", formFilter);
    if (search) params.set("q", search);
    return `/api/v1/admin/feedback/export?${params.toString()}`;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Feedback submissions</CardTitle>
        <CardDescription>Every response to a feedback-category form, searchable and exportable.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="Search by form, name, or email"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="max-w-md"
            />
            <select
              aria-label="Filter by form"
              value={formFilter}
              onChange={(event) => setFormFilter(event.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="ALL">All forms</option>
              {forms.map((form) => (
                <option key={form.id} value={form.id}>
                  {form.title}
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

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading feedback…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No feedback submissions match.</p>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((submission) => (
              <div key={submission.responseId} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{submission.anonymous ? "Anonymous" : submission.respondentName ?? "—"}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {submission.formTitle} · {new Date(submission.submittedAt).toLocaleString()}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setDetailsTarget(submission)}>
                  View
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={Boolean(detailsTarget)} onOpenChange={(open) => !open && setDetailsTarget(null)}>
        <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detailsTarget?.anonymous ? "Anonymous" : detailsTarget?.respondentName ?? "Feedback submission"}</DialogTitle>
            <DialogDescription>
              {detailsTarget?.formTitle} · {detailsTarget ? new Date(detailsTarget.submittedAt).toLocaleString() : ""}
            </DialogDescription>
          </DialogHeader>
          {detailsTarget?.respondentEmail ? (
            <p className="text-sm text-muted-foreground">{detailsTarget.respondentEmail}</p>
          ) : null}
          <div className="flex flex-col gap-4">
            {detailsTarget?.answers.map((answer) => (
              <div key={answer.questionId}>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{answer.questionTitle}</p>
                <p className="text-sm">{answer.value || "—"}</p>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsTarget(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
