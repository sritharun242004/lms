"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, FileSpreadsheet, Search, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Item = { id: string; question: string; options: { text: string }[]; createdBy: { name: string } };

export default function QuestionLibraryPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [items, setItems] = React.useState<Item[]>([]);
  const [search, setSearch] = React.useState("");
  const [file, setFile] = React.useState<File>();
  const [isUploading, setIsUploading] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/v1/questions").then((response) => response.json()).then((result) => setItems(result.data?.items ?? []));
  }, []);

  async function upload() {
    if (!file) return;
    setIsUploading(true);
    const form = new FormData();
    form.set("file", file);
    try {
      const response = await fetch("/api/v1/questions", { method: "PUT", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Could not upload questions");
      toast.success(`${result.data?.count ?? 0} questions saved`);
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload questions");
    } finally {
      setIsUploading(false);
    }
  }

  const visible = items.filter((item) => `${item.question} ${item.options.map((option) => option.text).join(" ")}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-7">
      <div>
        <p className="mb-2 text-xs font-semibold tracking-[.14em] text-primary uppercase">Reusable content</p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Question library</h1>
        <p className="mt-2 text-sm text-muted-foreground">Shared multiple-choice questions for coaches and super admins.</p>
      </div>

      <Card>
        <CardHeader>
          <span className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><FileSpreadsheet className="size-5" /></span>
          <CardTitle>Upload questions</CardTitle>
          <CardDescription>CSV or Excel columns: Question, Option1, Option2, up to Option8.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Input type="file" accept=".csv,.xlsx,.xls" onChange={(event) => setFile(event.target.files?.[0])} />
          <Button onClick={upload} disabled={!file || isUploading} className="shrink-0"><Upload className="size-4" />{isUploading ? "Uploading…" : "Upload and save"}</Button>
        </CardContent>
      </Card>

      <div className="relative max-w-xl"><Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-11" placeholder="Search saved questions" value={search} onChange={(event) => setSearch(event.target.value)} /></div>

      <div className="grid gap-4">
        {visible.map((item) => (
          <Card key={item.id}>
            <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div><p className="text-base font-semibold">{item.question}</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{item.options.map((option) => option.text).join(" · ")}</p><span className="mt-3 block text-xs text-muted-foreground">Saved by {item.createdBy.name}</span></div>
              <Button size="sm" className="shrink-0" onClick={() => { sessionStorage.setItem("cms-poll-template", JSON.stringify({ question: item.question, options: item.options.map((option) => option.text) })); router.push(params.get("returnTo") || "/chat"); }}><CheckCircle2 className="size-4" />Use question</Button>
            </CardContent>
          </Card>
        ))}
        {visible.length === 0 && <div className="glass rounded-3xl px-6 py-12 text-center text-sm text-muted-foreground">No saved questions match your search.</div>}
      </div>
    </div>
  );
}
