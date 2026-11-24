"use client";
import * as React from "react";
import { ChevronDown, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getPack, patchPack } from "@/lib/skills/client";
import { GENERATION_STALE_MS } from "@/lib/skills/limits";
import type { SkillItemView, SkillPackView } from "@/lib/skills/types";
import { cn } from "@/lib/utils";
import { SkillPreview } from "./skill-preview";
import { SkillRefine } from "./skill-refine";
import { SkillsList } from "./skills-list";

const POLL_FIRST_MS = 3000;
const POLL_MAX_MS = 15_000;
/** A minute past the stale window: by then the server reports an unfinished skill as interrupted and retryable. */
const POLL_CAP_MS = GENERATION_STALE_MS + 60_000;

type Step = "skills" | "refine" | "preview";
const STEPS: { id: Step; label: string }[] = [
  { id: "skills", label: "Skills" },
  { id: "refine", label: "Refine" },
  { id: "preview", label: "Preview and download" },
];

export function PackView({ initial }: { initial: SkillPackView }) {
  const [pack, setPack] = React.useState(initial);
  const [step, setStep] = React.useState<Step>("skills");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [opened, setOpened] = React.useState<string[]>([]);
  const [editingTitle, setEditingTitle] = React.useState(false);
  const [title, setTitle] = React.useState(initial.title);
  const previewDirty = React.useRef(false);
  const onDirtyChange = React.useCallback((dirty: boolean) => {
    previewDirty.current = dirty;
  }, []);

  const custom = pack.items.filter((i) => i.kind === "CUSTOM");
  const selected = custom.find((i) => i.id === selectedId) ?? custom[0] ?? null;
  const readyCount = custom.filter((i) => i.status === "READY").length;

  const replaceItem = React.useCallback((item: SkillItemView) => {
    setPack((p) => ({ ...p, items: p.items.map((i) => (i.id === item.id ? item : i)) }));
  }, []);

  // Generation runs after its request returns, so the pack is polled while any skill is being written,
  // whichever step is open. Backoff keeps it cheap; the cap keeps a stuck skill from polling forever.
  const generatingIds = custom.filter((i) => i.status === "GENERATING").map((i) => i.id).join(",");
  const [stalledFor, setStalledFor] = React.useState("");
  const stalled = generatingIds !== "" && stalledFor === generatingIds;
  React.useEffect(() => {
    if (!generatingIds) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let delay = POLL_FIRST_MS;
    let waited = 0;
    const poll = async () => {
      const result = await getPack(pack.id);
      if (cancelled) return;
      if (result.ok) {
        const fresh = new Map(result.data.items.map((i) => [i.id, i]));
        setPack((p) => ({
          ...p,
          items: p.items.map((i) => {
            const next = fresh.get(i.id);
            return i.status === "GENERATING" && next && next.status !== "GENERATING" ? next : i;
          }),
        }));
        if (!result.data.items.some((i) => i.status === "GENERATING")) return;
      }
      waited += delay;
      if (waited >= POLL_CAP_MS) return setStalledFor(generatingIds);
      delay = Math.min(Math.round(delay * 1.5), POLL_MAX_MS);
      timer = setTimeout(poll, delay);
    };
    timer = setTimeout(poll, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [generatingIds, pack.id]);

  function go(next: Step, itemId?: string) {
    const leavingEdits = step === "preview" && previewDirty.current && (next !== "preview" || (itemId !== undefined && itemId !== selected?.id));
    if (leavingEdits) {
      if (!window.confirm("Discard your unsaved file changes?")) return;
      previewDirty.current = false;
    }
    const id = itemId ?? selected?.id;
    if (itemId) setSelectedId(itemId);
    if (next === "refine" && id) setOpened((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setStep(next);
  }

  async function saveTitle(event?: React.FormEvent) {
    event?.preventDefault();
    setEditingTitle(false);
    const value = title.trim();
    if (!value || value === pack.title) return setTitle(pack.title);
    const result = await patchPack(pack.id, { title: value });
    if (!result.ok) {
      toast.error(result.message);
      return setTitle(pack.title);
    }
    setPack((p) => ({ ...p, title: result.data.title }));
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <header className="min-w-0">
        {editingTitle ? (
          <form onSubmit={saveTitle} className="max-w-xl">
            <label htmlFor="pack-title" className="sr-only">Pack title</label>
            <Input id="pack-title" autoFocus value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} onBlur={() => void saveTitle()} className="text-lg font-semibold" />
          </form>
        ) : (
          <div className="flex items-center gap-1">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{pack.title}</h1>
            <Button variant="ghost" size="icon" aria-label="Rename pack" onClick={() => setEditingTitle(true)}>
              <Pencil className="size-4" aria-hidden />
            </Button>
          </div>
        )}
        <p className="mt-1 line-clamp-2 max-w-3xl text-sm text-muted-foreground">{pack.description}</p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Steps">
          <ol className="flex flex-wrap gap-2">
            {STEPS.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => go(s.id)}
                  disabled={s.id !== "skills" && custom.length === 0}
                  aria-current={step === s.id ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:pointer-events-none disabled:opacity-50",
                    step === s.id ? "bg-primary text-primary-foreground" : "bg-white/55 text-muted-foreground hover:text-foreground dark:bg-white/5",
                  )}
                >
                  <span aria-hidden className="flex size-5 items-center justify-center rounded-full bg-black/5 text-xs tabular-nums dark:bg-white/10">
                    {i + 1}
                  </span>
                  {s.label}
                </button>
              </li>
            ))}
          </ol>
        </nav>
        {step !== "skills" && selected && (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Skill</span>
            <span className="relative">
              <select
                value={selected.id}
                onChange={(e) => go(step, e.target.value)}
                className="appearance-none rounded-xl border border-border bg-white/60 py-1.5 pl-3 pr-8 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 dark:bg-white/5"
              >
                {custom.map((i) => (
                  <option key={i.id} value={i.id}>{i.name}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-2 size-4 text-muted-foreground" aria-hidden />
            </span>
          </label>
        )}
      </div>

      {stalled && (
        <p role="status" className="rounded-xl bg-warning/10 px-3 py-2 text-sm">
          Still working. A skill is taking longer than usual. Refresh this page later to see the result.
        </p>
      )}

      {step === "skills" && (
        <SkillsList
          pack={pack}
          onItemsChange={(items) => setPack((p) => ({ ...p, items }))}
          onRefine={(id) => go("refine", id)}
          onPreview={(id) => go("preview", id)}
        />
      )}

      {custom
        .filter((i) => opened.includes(i.id))
        .map((i) => (
          <div key={i.id} hidden={!(step === "refine" && i.id === selected?.id)}>
            <SkillRefine
              packId={pack.id}
              item={i}
              matrix={pack.matrix}
              onItemChange={replaceItem}
              onGenerated={(next) => {
                replaceItem(next);
                setSelectedId(next.id);
                setStep("preview");
              }}
            />
          </div>
        ))}

      {step === "preview" && selected && (
        <SkillPreview
          key={selected.id}
          packId={pack.id}
          item={selected}
          readyCount={readyCount}
          onItemChange={replaceItem}
          onRefine={() => go("refine")}
          onDirtyChange={onDirtyChange}
        />
      )}
    </div>
  );
}
