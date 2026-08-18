"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, FileSpreadsheet, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { sanitizeReturnPath } from "@/lib/auth/portal-navigation";

type Item = {
  id: string;
  name: string;
  question: string;
  chartType: "BAR" | "DONUT" | "PIE";
  options: { text: string }[];
  createdBy: { name: string };
};

type Editor = { id?: string; name: string; question: string; options: string };
const EMPTY_EDITOR: Editor = { name: "", question: "", options: "" };

export default function QuizRepositoryPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [items, setItems] = React.useState<Item[]>([]);
  const [search, setSearch] = React.useState("");
  const [file, setFile] = React.useState<File>();
  const [editor, setEditor] = React.useState<Editor | null>(null);
  const [isBusy, setIsBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    const response = await fetch("/api/v1/questions");
    const result = await response.json();
    if (response.ok) setItems(result.data?.items ?? []);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    void fetch("/api/v1/questions")
      .then((response) => response.json())
      .then((result) => { if (!cancelled) setItems(result.data?.items ?? []); });
    return () => { cancelled = true; };
  }, []);

  async function upload() {
    if (!file) return;
    setIsBusy(true);
    const form = new FormData();
    form.set("file", file);
    try {
      const response = await fetch("/api/v1/questions", { method: "PUT", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Could not upload quizzes");
      toast.success(`${result.data?.count ?? 0} quizzes saved`);
      setFile(undefined);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload quizzes");
    } finally {
      setIsBusy(false);
    }
  }

  async function saveEditor() {
    if (!editor) return;
    setIsBusy(true);
    try {
      const response = await fetch(editor.id ? `/api/v1/questions/${editor.id}` : "/api/v1/questions", {
        method: editor.id ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: editor.name,
          question: editor.question,
          options: editor.options.split("\n"),
          chartType: "BAR",
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Could not save quiz");
      toast.success(editor.id ? "Quiz updated" : "Quiz saved");
      setEditor(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save quiz");
    } finally {
      setIsBusy(false);
    }
  }

  async function remove(item: Item) {
    if (!window.confirm(`Delete “${item.name}”?`)) return;
    const response = await fetch(`/api/v1/questions/${item.id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) return toast.error(result.error?.message || "Could not delete quiz");
    toast.success("Quiz deleted");
    setItems((current) => current.filter((quiz) => quiz.id !== item.id));
  }

  function applyQuiz(item: Item) {
    sessionStorage.setItem("cms-poll-template", JSON.stringify({
      question: item.question,
      options: item.options.map((option) => option.text),
      chartType: item.chartType,
    }));
    const returnTo = sanitizeReturnPath(params.get("returnTo"), "/chat", ["/chat"]);
    router.push(`${returnTo}${returnTo.includes("?") ? "&" : "?"}openPoll=1`);
  }

  const needle = search.toLowerCase();
  const visible = items.filter((item) =>
    `${item.name} ${item.question} ${item.options.map((option) => option.text).join(" ")}`.toLowerCase().includes(needle)
  );

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-xs font-semibold tracking-[.14em] text-primary uppercase">Reusable content</p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Quiz repository</h1>
          <p className="mt-2 text-sm text-muted-foreground">Named multiple-choice quizzes available to participants and super admins.</p>
        </div>
        <Button onClick={() => setEditor({ ...EMPTY_EDITOR })}><Plus className="size-4" />Create quiz</Button>
      </div>

      {editor && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle>{editor.id ? "Edit quiz" : "Create quiz"}</CardTitle>
            <CardDescription>Give the quiz a memorable name, then enter one choice per line.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2"><Label htmlFor="quiz-name">Quiz name</Label><Input id="quiz-name" value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} placeholder="Product knowledge — Week 1" /></div>
            <div className="grid gap-2"><Label htmlFor="quiz-question">Question</Label><Input id="quiz-question" value={editor.question} onChange={(event) => setEditor({ ...editor, question: event.target.value })} placeholder="Which plan includes exports?" /></div>
            <div className="grid gap-2"><Label htmlFor="quiz-options">Choices</Label><Textarea id="quiz-options" rows={5} value={editor.options} onChange={(event) => setEditor({ ...editor, options: event.target.value })} placeholder={"Basic\nPro\nEnterprise"} /></div>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEditor(null)}>Cancel</Button><Button onClick={saveEditor} disabled={isBusy}>{editor.id ? "Save changes" : "Save quiz"}</Button></div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <span className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><FileSpreadsheet className="size-5" /></span>
          <CardTitle>Bulk upload quizzes</CardTitle>
          <CardDescription>CSV or Excel columns: Name, Question, Option1, Option2, up to Option8.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Input key={file?.name ?? "empty"} type="file" accept=".csv,.xlsx,.xls" onChange={(event) => setFile(event.target.files?.[0])} />
          <Button onClick={upload} disabled={!file || isBusy} className="shrink-0"><Upload className="size-4" />{isBusy ? "Uploading…" : "Upload and save"}</Button>
        </CardContent>
      </Card>

      <div className="relative max-w-xl"><Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-11" placeholder="Search quiz names, questions, or choices" value={search} onChange={(event) => setSearch(event.target.value)} /></div>

      <div className="grid gap-4">
        {visible.map((item) => (
          <Card key={item.id}>
            <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0"><p className="text-xs font-semibold tracking-wide text-primary uppercase">{item.name}</p><p className="mt-1 text-base font-semibold">{item.question}</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{item.options.map((option) => option.text).join(" · ")}</p><span className="mt-3 block text-xs text-muted-foreground">Saved by {item.createdBy.name}</span></div>
              <div className="flex shrink-0 flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => setEditor({ id: item.id, name: item.name, question: item.question, options: item.options.map((option) => option.text).join("\n") })}><Pencil className="size-4" />Edit</Button><Button variant="outline" size="sm" onClick={() => void remove(item)}><Trash2 className="size-4" />Delete</Button><Button size="sm" onClick={() => applyQuiz(item)}><CheckCircle2 className="size-4" />Use quiz</Button></div>
            </CardContent>
          </Card>
        ))}
        {visible.length === 0 && <div className="glass rounded-3xl px-6 py-12 text-center text-sm text-muted-foreground">No saved quizzes match your search.</div>}
      </div>
    </div>
  );
}
