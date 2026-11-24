"use client";
import * as React from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, type ConfirmDialogHandle } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type Question = { id?: string; text: string; guidance: string; element: string | null; isActive?: boolean };
type Matrix = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  kind: "CORE" | "TASK";
  isBuiltIn: boolean;
  isActive: boolean;
  questions: Question[];
};

const MAX_QUESTIONS = 20;
const activeQuestions = (m: Matrix | null) => m?.questions.filter((q) => q.isActive !== false) ?? [];

async function call(url: string, method: string, payload?: unknown) {
  try {
    const res = await fetch(url, {
      method,
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    const body = await res.json().catch(() => null);
    return { ok: res.ok, data: body?.data, message: (body?.error?.message as string | undefined) ?? null };
  } catch {
    return { ok: false, data: null, message: "Network error. Check your connection and try again." };
  }
}

export function MatrixEditor({ initial }: { initial: Matrix[] }) {
  const [matrices, setMatrices] = React.useState(initial);
  const [selectedId, setSelectedId] = React.useState<string | null>(initial[0]?.id ?? null);
  const selected = matrices.find((m) => m.id === selectedId) ?? null;
  const [draft, setDraft] = React.useState<Question[]>(() => activeQuestions(selected));
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const confirmRef = React.useRef<ConfirmDialogHandle>(null);

  function select(id: string | null, source: Matrix[] = matrices) {
    setSelectedId(id);
    setDraft(activeQuestions(source.find((m) => m.id === id) ?? null));
    setError(null);
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(activeQuestions(selected));

  async function save(patch: Record<string, unknown>) {
    if (!selected || saving) return;
    setSaving(true);
    setError(null);
    const res = await call(`/api/v1/prompt-bot/matrices/${selected.id}`, "PATCH", patch);
    setSaving(false);
    if (!res.ok) {
      const message = res.message ?? "Couldn't save the matrix.";
      setError(message);
      return toast.error(message);
    }
    setMatrices((prev) => prev.map((m) => (m.id === selected.id ? res.data : m)));
    if ("questions" in patch) setDraft(activeQuestions(res.data));
    toast.success("Matrix saved");
  }

  async function createMatrix(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name || saving) return;
    setSaving(true);
    setError(null);
    const res = await call("/api/v1/prompt-bot/matrices", "POST", { name, questions: [] });
    setSaving(false);
    if (!res.ok) {
      const message = res.message ?? "Couldn't create the matrix.";
      setError(message);
      return toast.error(message);
    }
    const next = [...matrices, res.data];
    setMatrices(next);
    select(res.data.id, next);
    setAdding(false);
    setNewName("");
  }

  async function removeMatrix() {
    if (!selected || selected.isBuiltIn) return;
    const ok = await confirmRef.current?.open({
      title: `Delete "${selected.name}"?`,
      description: "Prompt Bot will stop asking these questions. This cannot be undone.",
      confirmLabel: "Delete matrix",
      destructive: true,
    });
    if (!ok) return;
    setSaving(true);
    const res = await call(`/api/v1/prompt-bot/matrices/${selected.id}`, "DELETE");
    setSaving(false);
    if (!res.ok) {
      const message = res.message ?? "Couldn't delete the matrix.";
      setError(message);
      return toast.error(message);
    }
    const next = matrices.filter((m) => m.id !== selected.id);
    setMatrices(next);
    select(next[0]?.id ?? null, next);
    toast.success("Matrix deleted");
  }

  const updateDraft = (i: number, patch: Partial<Question>) =>
    setDraft((d) => d.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <div className="grid gap-5 md:grid-cols-[16rem_minmax(0,1fr)]">
      <nav aria-label="Matrices" className="glass h-fit rounded-[1.75rem] p-3">
        <ul className="flex flex-col gap-1">
          {matrices.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => select(m.id)}
                aria-current={m.id === selectedId ? "true" : undefined}
                className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${m.id === selectedId ? "bg-primary/10 font-medium text-primary" : "hover:bg-white/55 dark:hover:bg-white/5"}`}
              >
                <span className={m.isActive ? "" : "text-muted-foreground line-through"}>{m.name}</span>
                {m.isBuiltIn && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground dark:bg-white/10">Built-in</span>
                )}
              </button>
            </li>
          ))}
        </ul>
        {adding ? (
          <form onSubmit={createMatrix} className="mt-2 flex flex-col gap-2 border-t border-border/60 pt-3">
            <Input
              aria-label="New matrix name"
              placeholder="e.g. Sales email"
              value={newName}
              maxLength={80}
              autoFocus
              onChange={(e) => setNewName(e.target.value)}
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={saving || !newName.trim()}>
                Create
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setAdding(false);
                  setNewName("");
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="ghost" className="mt-2 w-full justify-start" onClick={() => setAdding(true)}>
            <Plus className="size-4" /> New task matrix
          </Button>
        )}
      </nav>

      {selected ? (
        <section className="glass rounded-[1.75rem] p-5" aria-labelledby="matrix-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="matrix-heading" className="text-lg font-semibold">Questions</h2>
              <p className="text-xs text-muted-foreground">
                {selected.kind === "CORE" ? "Applied to every prompt. Can be edited but not switched off." : "Applied when Prompt Bot detects this kind of task."}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {selected.kind !== "CORE" && (
                <label className="flex items-center gap-2 text-sm">
                  Active
                  <Switch
                    aria-label={`${selected.name} active`}
                    checked={selected.isActive}
                    disabled={saving}
                    onCheckedChange={(isActive) => save({ isActive })}
                  />
                </label>
              )}
              {!selected.isBuiltIn && (
                <Button variant="ghost" size="icon" aria-label={`Delete ${selected.name}`} disabled={saving} onClick={removeMatrix}>
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          </div>

          {draft.length === 0 && (
            <p className="mt-4 rounded-2xl border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
              No questions yet. Add the first one below.
            </p>
          )}
          <ol className="mt-4 flex flex-col gap-3">
            {draft.map((q, i) => (
              <li key={q.id ?? `new-${i}`} className="rounded-2xl border border-border/70 p-3">
                <div className="flex items-start gap-2">
                  <span className="mt-2 w-5 text-sm text-muted-foreground">{i + 1}.</span>
                  <div className="flex-1 space-y-2">
                    <Input aria-label={`Question ${i + 1}`} value={q.text} maxLength={300} onChange={(e) => updateDraft(i, { text: e.target.value })} />
                    <Textarea
                      aria-label={`Guidance for question ${i + 1}`}
                      value={q.guidance}
                      maxLength={600}
                      placeholder="What does a complete answer contain? The AI scores against this."
                      onChange={(e) => updateDraft(i, { guidance: e.target.value })}
                      className="min-h-16"
                    />
                  </div>
                  <Button variant="ghost" size="icon" aria-label={`Remove question ${i + 1}`} onClick={() => setDraft((d) => d.filter((_, j) => j !== i))}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ol>

          {error && (
            <p role="alert" className="mt-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <Button
              variant="outline"
              disabled={draft.length >= MAX_QUESTIONS}
              onClick={() => setDraft((d) => [...d, { text: "", guidance: "", element: null }])}
            >
              <Plus className="size-4" /> Add question
              <span className="text-xs font-normal text-muted-foreground">
                {draft.length}/{MAX_QUESTIONS}
              </span>
            </Button>
            <Button onClick={() => save({ questions: draft })} disabled={saving || !dirty}>
              <Save className="size-4" /> {saving ? "Saving..." : "Save questions"}
            </Button>
          </div>
        </section>
      ) : (
        <section className="glass rounded-[1.75rem] p-5 text-sm text-muted-foreground">Select or create a matrix to edit its questions.</section>
      )}
      <ConfirmDialog ref={confirmRef} />
    </div>
  );
}
