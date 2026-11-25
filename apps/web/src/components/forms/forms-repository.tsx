"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Pencil, Pin, Plus } from "lucide-react";
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
  isTemplate: boolean;
  canEdit: boolean;
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

  const templates = forms.filter((form) => form.isTemplate);
  const [usingTemplateId, setUsingTemplateId] = React.useState<string | null>(null);

  const filtered = forms.filter((form) => {
    if (form.isTemplate) return false;
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
      setForms((current) => [{ ...data.form, canEdit: true, _count: { sections: 0, responses: 0 } }, ...current]);
      toast.success("Form duplicated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to duplicate form");
    }
  }

  // Using a template = an editable copy of your own, opened straight in the
  // builder, so the template itself is never filled or changed by accident.
  async function copyTemplate(templateId: string) {
    setUsingTemplateId(templateId);
    try {
      const data = await requestJson<{ form: { id: string } }>(`/api/v1/forms/${templateId}/duplicate`, { method: "POST" });
      router.push(`/forms/${data.form.id}/edit`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to use this template");
      setUsingTemplateId(null);
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

      {templates.length > 0 ? (
        <section aria-labelledby="templates-heading" className="flex flex-col gap-3">
          <h2 id="templates-heading" className="flex items-center gap-2 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            <Pin className="size-4" aria-hidden="true" /> Templates
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {templates.map((template) => (
              <Card key={template.id} className="border-primary/25">
                <CardContent className="flex h-full flex-col gap-4 p-4">
                  <div className="flex flex-col gap-1">
                    <p className="font-semibold">{template.title}</p>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">Template</Badge>
                      {template.category === "FEEDBACK" ? <Badge variant="secondary">Feedback</Badge> : null}
                    </div>
                  </div>
                  <div className="mt-auto flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => copyTemplate(template.id)} disabled={usingTemplateId !== null}>
                      <Copy className="size-4" /> {usingTemplateId === template.id ? "Creating..." : "Use template"}
                    </Button>
                    {template.canEdit ? (
                      <Button asChild size="sm" variant="outline">
                        <a href={`/forms/${template.id}/edit`}>
                          <Pencil className="size-4" /> Edit template
                        </a>
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

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
