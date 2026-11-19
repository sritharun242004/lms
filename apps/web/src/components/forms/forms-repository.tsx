"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export type FormRow = {
  id: string;
  title: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  category: "GENERIC" | "FEEDBACK";
  updatedAt: string;
  _count: { sections: number; responses: number };
};

const STATUS_VARIANT: Record<FormRow["status"], "secondary" | "success" | "destructive"> = {
  DRAFT: "secondary",
  PUBLISHED: "success",
  ARCHIVED: "destructive",
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.error?.message || "Request failed");
  return result.data as T;
}

export function FormsRepository({ forms: initialForms }: { forms: FormRow[] }) {
  const router = useRouter();
  const [forms, setForms] = React.useState(initialForms);
  const [filter, setFilter] = React.useState<FormRow["status"] | "ALL">("ALL");
  const [search, setSearch] = React.useState("");
  const [isCreating, setIsCreating] = React.useState(false);

  const filtered = forms.filter((form) => {
    if (filter !== "ALL" && form.status !== filter) return false;
    if (search && !form.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  async function createForm() {
    setIsCreating(true);
    try {
      const data = await requestJson<{ form: { id: string } }>("/api/v1/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled form" }),
      });
      router.push(`/forms/${data.form.id}/edit`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create form");
    } finally {
      setIsCreating(false);
    }
  }

  async function duplicate(formId: string) {
    try {
      const data = await requestJson<{ form: FormRow }>(`/api/v1/forms/${formId}/duplicate`, { method: "POST" });
      setForms((current) => [{ ...data.form, _count: { sections: 0, responses: 0 } }, ...current]);
      toast.success("Form duplicated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to duplicate form");
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="mb-2 text-xs font-semibold tracking-[.14em] text-primary uppercase">Forms</p>
          <h1 className="text-3xl font-bold tracking-tight">Form repository</h1>
        </div>
        <Button onClick={createForm} disabled={isCreating}>
          <Plus className="size-4" /> New form
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["ALL", "DRAFT", "PUBLISHED", "ARCHIVED"] as const).map((status) => (
          <Button key={status} size="sm" variant={filter === status ? "default" : "outline"} onClick={() => setFilter(status)}>
            {status}
          </Button>
        ))}
        <Input placeholder="Search forms" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No forms match.</p>
      ) : (
        <div className="grid gap-3">
          {filtered.map((form) => (
            <Card key={form.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <a href={`/forms/${form.id}/edit`} className="font-semibold hover:underline">
                      {form.title}
                    </a>
                    <Badge variant={STATUS_VARIANT[form.status]}>{form.status}</Badge>
                    {form.category === "FEEDBACK" ? <Badge variant="secondary">Feedback</Badge> : null}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {form._count.sections} section(s) · {form._count.responses} response(s)
                  </p>
                </div>
                <div className="flex gap-2">
                  {form.status !== "DRAFT" ? (
                    <Button asChild variant="outline" size="sm">
                      <a href={`/forms/${form.id}/analytics`}>Analytics</a>
                    </Button>
                  ) : null}
                  <Button variant="outline" size="sm" onClick={() => duplicate(form.id)}>
                    <Copy className="size-4" /> Duplicate
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
