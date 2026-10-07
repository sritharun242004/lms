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
import { cn } from "@/lib/utils";

type LibraryType = "MULTIPLE_CHOICE" | "WORD_CLOUD" | "OPEN_ENDED" | "SCALE";

type Item = {
  id: string;
  name: string;
  question: string;
  type: LibraryType;
  chartType: "BAR" | "DONUT" | "PIE";
  options: { text: string }[];
  scaleStatements?: { text: string; max: number; order: number }[];
  createdAt?: string;
  updatedAt?: string;
  createdBy: { name: string };
};

type QuizEditor = { id?: string; name: string; question: string; options: string };
type QuestionEditor = { id?: string; name: string; question: string; type: "WORD_CLOUD" | "OPEN_ENDED" | "SCALE"; statements: { text: string; max: string }[] };

const EMPTY_QUIZ: QuizEditor = { name: "", question: "", options: "" };
const EMPTY_QUESTION: QuestionEditor = { name: "", question: "", type: "WORD_CLOUD", statements: [{ text: "", max: "5" }] };

function friendlyType(type: LibraryType) {
  if (type === "WORD_CLOUD") return "Word Cloud";
  if (type === "OPEN_ENDED") return "Open-ended";
  if (type === "SCALE") return "Scale";
  return "Multiple choice";
}

export default function QuestionRepositoryPage() {
  const router = useRouter();
  const params = useSearchParams();
  const activeTab = params.get("tab") === "questions" ? "questions" : "quizzes";
  const [items, setItems] = React.useState<Item[]>([]);
  const [search, setSearch] = React.useState("");
  const [file, setFile] = React.useState<File>();
  const [quizEditor, setQuizEditor] = React.useState<QuizEditor | null>(null);
  const [questionEditor, setQuestionEditor] = React.useState<QuestionEditor | null>(null);
  const [isBusy, setIsBusy] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const loadGeneration = React.useRef(0);

  const endpoint = activeTab === "questions" ? "/api/v1/questions?tab=questions" : "/api/v1/questions";

  const load = React.useCallback(async () => {
    const generation = ++loadGeneration.current;
    setIsLoading(true);
    setLoadError(null);
    setItems([]);
    try {
      const response = await fetch(endpoint);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Could not load repository content");
      if (generation === loadGeneration.current) setItems(result.data?.items ?? []);
    } catch (error) {
      if (generation === loadGeneration.current) {
        setLoadError(error instanceof Error ? error.message : "Could not load repository content");
      }
    } finally {
      if (generation === loadGeneration.current) setIsLoading(false);
    }
  }, [endpoint]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function tabHref(tab: "quizzes" | "questions") {
    const next = new URLSearchParams();
    next.set("tab", tab);
    const returnTo = params.get("returnTo");
    if (returnTo) next.set("returnTo", returnTo);
    return `/questions?${next.toString()}`;
  }

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

  async function saveQuiz() {
    if (!quizEditor) return;
    setIsBusy(true);
    try {
      const response = await fetch(quizEditor.id ? `/api/v1/questions/${quizEditor.id}` : "/api/v1/questions", {
        method: quizEditor.id ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: quizEditor.name,
          question: quizEditor.question,
          options: quizEditor.options.split("\n"),
          chartType: "BAR",
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Could not save quiz");
      toast.success(quizEditor.id ? "Quiz updated" : "Quiz saved");
      setQuizEditor(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save quiz");
    } finally {
      setIsBusy(false);
    }
  }

  async function saveQuestion() {
    if (!questionEditor) return;
    setIsBusy(true);
    try {
      const response = await fetch(questionEditor.id ? `/api/v1/questions/${questionEditor.id}` : "/api/v1/questions", {
        method: questionEditor.id ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          questionEditor.type === "SCALE"
            ? { name: questionEditor.name, type: "SCALE", statements: questionEditor.statements.map((statement) => ({ text: statement.text, max: Number(statement.max) })) }
            : { name: questionEditor.name, question: questionEditor.question, type: questionEditor.type }
        ),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Could not save question");
      toast.success(questionEditor.id ? "Question updated" : "Question saved");
      setQuestionEditor(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save question");
    } finally {
      setIsBusy(false);
    }
  }

  async function remove(item: Item) {
    const label = item.type === "MULTIPLE_CHOICE" ? "quiz" : "question template";
    if (!window.confirm(`Delete “${item.name}”? This removes only the reusable ${label}; published sessions stay intact.`)) return;
    const response = await fetch(`/api/v1/questions/${item.id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) return toast.error(result.error?.message || `Could not delete ${label}`);
    toast.success(item.type === "MULTIPLE_CHOICE" ? "Quiz deleted" : "Question deleted");
    setItems((current) => current.filter((entry) => entry.id !== item.id));
  }

  function returnPath(query: string) {
    const returnTo = sanitizeReturnPath(params.get("returnTo"), "/chat", ["/chat"]);
    return `${returnTo}${returnTo.includes("?") ? "&" : "?"}${query}`;
  }

  function applyQuiz(item: Item) {
    sessionStorage.setItem("cms-poll-template", JSON.stringify({
      question: item.question,
      options: item.options.map((option) => option.text),
      chartType: item.chartType,
    }));
    router.push(returnPath("openPoll=1"));
  }

  function applyQuestion(item: Item) {
    if (item.type === "SCALE") {
      sessionStorage.setItem("cms-scale-template", JSON.stringify({
        statements: (item.scaleStatements ?? []).map((statement) => ({ text: statement.text, max: statement.max })),
      }));
      router.push(returnPath("openScale=1"));
      return;
    }
    const isWordCloud = item.type === "WORD_CLOUD";
    sessionStorage.setItem(isWordCloud ? "cms-word-cloud-template" : "cms-open-question-template", JSON.stringify({ question: item.question }));
    router.push(returnPath(isWordCloud ? "openWordCloud=1" : "openQuestion=1"));
  }

  const needle = search.toLowerCase();
  const visible = items.filter((item) =>
    `${item.name} ${item.question} ${item.options?.map((option) => option.text).join(" ") ?? ""}`.toLowerCase().includes(needle)
  );

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-xs font-semibold tracking-[.14em] text-primary uppercase">Reusable content</p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Question repository</h1>
          <p className="mt-2 text-sm text-muted-foreground">Manage reusable quizzes and standalone questions for live participant sessions.</p>
        </div>
        {activeTab === "quizzes" ? (
          <Button onClick={() => setQuizEditor({ ...EMPTY_QUIZ })}><Plus className="size-4" />Create quiz</Button>
        ) : (
          <Button onClick={() => setQuestionEditor({ ...EMPTY_QUESTION })}><Plus className="size-4" />Create question</Button>
        )}
      </div>

      <nav aria-label="Question repository sections" className="flex w-fit gap-1 rounded-2xl border border-white/60 bg-white/35 p-1 shadow-sm dark:border-white/10 dark:bg-white/5">
        {(["quizzes", "questions"] as const).map((tab) => (
          <a key={tab} href={tabHref(tab)} aria-current={activeTab === tab ? "page" : undefined} className={cn("rounded-xl px-4 py-2 text-sm font-semibold transition-colors", activeTab === tab ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-white/60 hover:text-primary dark:hover:bg-white/10")}>
            {tab === "quizzes" ? "Quizzes" : "Questions"}
          </a>
        ))}
      </nav>

      {activeTab === "quizzes" ? (
        <>
          {quizEditor && (
            <Card className="border-primary/30">
              <CardHeader><CardTitle>{quizEditor.id ? "Edit quiz" : "Create quiz"}</CardTitle><CardDescription>Give the quiz a memorable name, then enter one choice per line.</CardDescription></CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2"><Label htmlFor="quiz-name">Quiz name</Label><Input id="quiz-name" value={quizEditor.name} onChange={(event) => setQuizEditor({ ...quizEditor, name: event.target.value })} placeholder="Product knowledge — Week 1" /></div>
                <div className="grid gap-2"><Label htmlFor="quiz-question">Question</Label><Input id="quiz-question" value={quizEditor.question} onChange={(event) => setQuizEditor({ ...quizEditor, question: event.target.value })} placeholder="Which plan includes exports?" /></div>
                <div className="grid gap-2"><Label htmlFor="quiz-options">Choices</Label><Textarea id="quiz-options" rows={5} value={quizEditor.options} onChange={(event) => setQuizEditor({ ...quizEditor, options: event.target.value })} placeholder={"Basic\nPro\nEnterprise"} /></div>
                <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setQuizEditor(null)}>Cancel</Button><Button onClick={saveQuiz} disabled={isBusy}>{quizEditor.id ? "Save changes" : "Save quiz"}</Button></div>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader><span className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><FileSpreadsheet className="size-5" /></span><CardTitle>Bulk upload quizzes</CardTitle><CardDescription>CSV or Excel columns: Name, Question, Option1, Option2, up to Option10.</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row"><Input key={file?.name ?? "empty"} type="file" accept=".csv,.xlsx,.xls" onChange={(event) => setFile(event.target.files?.[0])} /><Button onClick={upload} disabled={!file || isBusy} className="shrink-0"><Upload className="size-4" />{isBusy ? "Uploading…" : "Upload and save"}</Button></CardContent>
          </Card>
        </>
      ) : questionEditor ? (
        <Card className="border-primary/30">
          <CardHeader><CardTitle>{questionEditor.id ? "Edit question" : "Create question"}</CardTitle><CardDescription>Create a reusable prompt for the existing Word Cloud or Open-ended participant experience.</CardDescription></CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2"><Label htmlFor="question-name">Question name</Label><Input id="question-name" value={questionEditor.name} onChange={(event) => setQuestionEditor({ ...questionEditor, name: event.target.value })} placeholder="Workshop reflection" /></div>
            {questionEditor.type === "SCALE" ? (
              <div className="grid gap-3">
                {questionEditor.statements.map((statement, index) => (
                  <div key={index} className="grid gap-2 rounded-xl border border-border/60 bg-muted/30 p-3">
                    <Label htmlFor={"scale-statement-" + index}>Statement {index + 1}</Label>
                    <Input id={"scale-statement-" + index} value={statement.text} onChange={(event) => setQuestionEditor({ ...questionEditor, statements: questionEditor.statements.map((entry, i) => i === index ? { ...entry, text: event.target.value } : entry) })} placeholder="I understand today’s lecture." />
                    <div className="flex items-center gap-3">
                      <Label htmlFor={"scale-max-" + index}>Maximum</Label>
                      <Input id={"scale-max-" + index} type="number" min={1} max={10} step={1} className="w-24" value={statement.max} onChange={(event) => setQuestionEditor({ ...questionEditor, statements: questionEditor.statements.map((entry, i) => i === index ? { ...entry, max: event.target.value } : entry) })} />
                      <span className="text-xs text-muted-foreground">0 → {statement.max || "?"}</span>
                      {questionEditor.statements.length > 1 && <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => setQuestionEditor({ ...questionEditor, statements: questionEditor.statements.filter((_, i) => i !== index) })}><Trash2 className="size-4" />Remove</Button>}
                    </div>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" className="self-start" disabled={questionEditor.statements.length >= 10} onClick={() => setQuestionEditor({ ...questionEditor, statements: [...questionEditor.statements, { text: "", max: "5" }] })}><Plus className="size-4" />Add statement</Button>
              </div>
            ) : (
              <div className="grid gap-2"><Label htmlFor="question-prompt">Question</Label><Textarea id="question-prompt" rows={4} value={questionEditor.question} onChange={(event) => setQuestionEditor({ ...questionEditor, question: event.target.value })} placeholder="What is one word that describes today’s session?" /></div>
            )}
            <div className="grid gap-2"><Label htmlFor="question-type">Question type</Label><select id="question-type" value={questionEditor.type} onChange={(event) => setQuestionEditor({ ...questionEditor, type: event.target.value as QuestionEditor["type"] })} className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"><option value="WORD_CLOUD">Word Cloud</option><option value="OPEN_ENDED">Open-ended</option><option value="SCALE">Scale</option></select></div>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setQuestionEditor(null)}>Cancel</Button><Button onClick={saveQuestion} disabled={isBusy}>{questionEditor.id ? "Save changes" : "Save question"}</Button></div>
          </CardContent>
        </Card>
      ) : null}

      <div className="relative max-w-xl"><Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-11" placeholder={activeTab === "quizzes" ? "Search quiz names, questions, or choices" : "Search question names or prompts"} value={search} onChange={(event) => setSearch(event.target.value)} /></div>

      <div className="grid gap-4">
        {visible.map((item) => (
          <Card key={item.id}>
            <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-semibold tracking-wide text-primary uppercase">{item.name}</p>{activeTab === "questions" && <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">{friendlyType(item.type)}</span>}</div>{item.type !== "SCALE" && <p className="mt-1 text-base font-semibold">{item.question}</p>}{activeTab === "quizzes" && <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.options.map((option) => option.text).join(" · ")}</p>}{item.type === "SCALE" && <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">{(item.scaleStatements ?? []).map((statement) => <li key={statement.order}>{statement.text} <span className="text-xs">(0 → {statement.max})</span></li>)}</ol>}<span className="mt-3 block text-xs text-muted-foreground">Saved by {item.createdBy.name}{activeTab === "questions" && item.createdAt ? ` · Created ${new Date(item.createdAt).toLocaleString()}` : ""}{activeTab === "questions" && item.updatedAt ? ` · Updated ${new Date(item.updatedAt).toLocaleString()}` : ""}</span></div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {activeTab === "quizzes" ? <Button variant="outline" size="sm" onClick={() => setQuizEditor({ id: item.id, name: item.name, question: item.question, options: item.options.map((option) => option.text).join("\n") })}><Pencil className="size-4" />Edit</Button> : <Button variant="outline" size="sm" onClick={() => setQuestionEditor({ id: item.id, name: item.name, question: item.question, type: item.type as QuestionEditor["type"], statements: item.type === "SCALE" ? (item.scaleStatements ?? []).map((statement) => ({ text: statement.text, max: String(statement.max) })) : [{ text: "", max: "5" }] })}><Pencil className="size-4" />Edit</Button>}
                <Button variant="outline" size="sm" onClick={() => void remove(item)}><Trash2 className="size-4" />Delete</Button>
                <Button size="sm" onClick={() => activeTab === "quizzes" ? applyQuiz(item) : applyQuestion(item)}><CheckCircle2 className="size-4" />{activeTab === "quizzes" ? "Use quiz" : "Use question"}</Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {isLoading && <div className="glass rounded-3xl px-6 py-12 text-center text-sm text-muted-foreground">Loading repository content…</div>}
        {!isLoading && loadError && <div role="alert" className="glass rounded-3xl border border-destructive/30 px-6 py-12 text-center text-sm text-destructive">{loadError}</div>}
        {!isLoading && !loadError && visible.length === 0 && <div className="glass rounded-3xl px-6 py-12 text-center text-sm text-muted-foreground">No saved {activeTab === "quizzes" ? "quizzes" : "questions"} match your search.</div>}
      </div>
    </div>
  );
}
