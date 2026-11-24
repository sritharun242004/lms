"use client";
import * as React from "react";
import { ArrowDown, ArrowUp, ExternalLink, Eye, Pencil, Plus, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, type ConfirmDialogHandle } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { addItem, deleteItem, patchItem } from "@/lib/skills/client";
import type { SkillItemStatus, SkillItemView, SkillPackView } from "@/lib/skills/types";

export const STATUS_BADGE: Record<SkillItemStatus, { label: string; variant: "secondary" | "warning" | "success" | "destructive" }> = {
  DRAFT: { label: "Draft", variant: "secondary" },
  GENERATING: { label: "Writing…", variant: "warning" },
  READY: { label: "Ready", variant: "success" },
  FAILED: { label: "Needs fixing", variant: "destructive" },
};

type Props = {
  pack: SkillPackView;
  onItemsChange(items: SkillItemView[]): void;
  onRefine(itemId: string): void;
  onPreview(itemId: string): void;
};

export function SkillsList({ pack, onItemsChange, onRefine, onPreview }: Props) {
  const custom = pack.items.filter((i) => i.kind === "CUSTOM").sort((a, b) => a.order - b.order);
  const catalog = pack.items.filter((i) => i.kind === "CATALOG");
  const [renaming, setRenaming] = React.useState<string | null>(null);
  const [nameDraft, setNameDraft] = React.useState("");
  const [newName, setNewName] = React.useState("");
  const [newPurpose, setNewPurpose] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const confirmRef = React.useRef<ConfirmDialogHandle>(null);

  async function rename(item: SkillItemView) {
    const name = nameDraft.trim();
    setRenaming(null);
    if (!name || name === item.name) return;
    const result = await patchItem(pack.id, item.id, { name });
    if (!result.ok) return void toast.error(result.message);
    onItemsChange(pack.items.map((i) => (i.id === item.id ? result.data : i)));
  }

  // Order values are not contiguous (catalog items sit between), so a move swaps the two values.
  async function move(item: SkillItemView, direction: -1 | 1) {
    const other = custom[custom.findIndex((i) => i.id === item.id) + direction];
    if (!other) return;
    const [mine, theirs] = await Promise.all([
      patchItem(pack.id, item.id, { order: other.order }),
      patchItem(pack.id, other.id, { order: item.order }),
    ]);
    const updated = new Map([mine, theirs].flatMap((r) => (r.ok ? [[r.data.id, r.data] as const] : [])));
    if (!mine.ok || !theirs.ok) toast.error("Couldn't reorder the skills. Refresh to see the current order.");
    if (updated.size > 0) onItemsChange(pack.items.map((i) => updated.get(i.id) ?? i).sort((a, b) => a.order - b.order));
  }

  async function remove(item: SkillItemView) {
    const confirmed = await confirmRef.current?.open({
      title: `Remove "${item.name}"?`,
      description: "Its answers and generated files are deleted too. This cannot be undone.",
      confirmLabel: "Remove skill",
      destructive: true,
    });
    if (!confirmed) return;
    const result = await deleteItem(pack.id, item.id);
    if (!result.ok) return void toast.error(result.message);
    onItemsChange(pack.items.filter((i) => i.id !== item.id));
  }

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (adding || !newName.trim() || !newPurpose.trim()) return;
    setAdding(true);
    const result = await addItem(pack.id, { name: newName.trim(), purpose: newPurpose.trim() });
    setAdding(false);
    if (!result.ok) return void toast.error(result.message);
    onItemsChange([...pack.items, result.data]);
    setNewName("");
    setNewPurpose("");
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <section className="glass rounded-[1.75rem] p-5" aria-labelledby="custom-heading">
        <h2 id="custom-heading" className="font-semibold">Build custom</h2>
        <p className="mt-1 text-sm text-muted-foreground">Skills written for your work. Refine each one, then generate it.</p>
        {custom.length === 0 && <p className="mt-4 text-sm text-muted-foreground">No custom skills yet. Add one below.</p>}
        <ul className="mt-4 flex flex-col gap-2">
          {custom.map((item, index) => (
            <li key={item.id} className="rounded-2xl border border-border/60 bg-white/45 p-3 dark:bg-white/5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  {renaming === item.id ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void rename(item);
                      }}
                    >
                      <label htmlFor={`rename-${item.id}`} className="sr-only">New name for {item.name}</label>
                      <Input
                        id={`rename-${item.id}`}
                        autoFocus
                        value={nameDraft}
                        maxLength={120}
                        onChange={(e) => setNameDraft(e.target.value)}
                        onBlur={() => void rename(item)}
                        className="h-8 font-mono text-sm"
                      />
                    </form>
                  ) : (
                    <p className="truncate font-mono text-sm font-medium">{item.name}</p>
                  )}
                  <p className="mt-1 text-sm text-muted-foreground">{item.purpose}</p>
                </div>
                <Badge variant={STATUS_BADGE[item.status].variant}>{STATUS_BADGE[item.status].label}</Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Button size="sm" onClick={() => onRefine(item.id)} aria-label={`Refine ${item.name}`}>
                  <Wand2 className="size-4" aria-hidden />
                  Refine
                </Button>
                {(item.files || item.status === "GENERATING") && (
                  <Button size="sm" variant="outline" onClick={() => onPreview(item.id)} aria-label={`Preview ${item.name}`}>
                    <Eye className="size-4" aria-hidden />
                    Preview
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={item.status === "GENERATING"}
                  onClick={() => {
                    setRenaming(item.id);
                    setNameDraft(item.name);
                  }}
                  aria-label={`Rename ${item.name}`}
                >
                  <Pencil className="size-4" aria-hidden />
                  Rename
                </Button>
                <Button size="sm" variant="ghost" disabled={index === 0} onClick={() => void move(item, -1)} aria-label={`Move ${item.name} up`}>
                  <ArrowUp className="size-4" aria-hidden />
                </Button>
                <Button size="sm" variant="ghost" disabled={index === custom.length - 1} onClick={() => void move(item, 1)} aria-label={`Move ${item.name} down`}>
                  <ArrowDown className="size-4" aria-hidden />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void remove(item)} aria-label={`Remove ${item.name}`}>
                  <Trash2 className="size-4" aria-hidden />
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <form onSubmit={add} className="mt-4 grid gap-2 rounded-2xl border border-dashed border-border p-3 sm:grid-cols-[12rem_minmax(0,1fr)_auto]">
          <label htmlFor="new-skill-name" className="sr-only">Skill name</label>
          <Input id="new-skill-name" value={newName} maxLength={120} onChange={(e) => setNewName(e.target.value)} placeholder="Skill name" />
          <label htmlFor="new-skill-purpose" className="sr-only">What it does</label>
          <Input id="new-skill-purpose" value={newPurpose} maxLength={300} onChange={(e) => setNewPurpose(e.target.value)} placeholder="What it does, in one line" />
          <Button type="submit" variant="outline" disabled={adding || !newName.trim() || !newPurpose.trim()}>
            <Plus className="size-4" aria-hidden />
            Add skill
          </Button>
        </form>
      </section>

      <section className="glass h-fit rounded-[1.75rem] p-5" aria-labelledby="existing-heading">
        <h2 id="existing-heading" className="font-semibold">Use existing</h2>
        <p className="mt-1 text-sm text-muted-foreground">Public skills that fit your work. Install them from their source.</p>
        {catalog.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No existing skills matched this work.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {catalog.map((item) => (
              <li key={item.id} className="rounded-2xl bg-white/45 p-3 dark:bg-white/5">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{item.catalog?.name ?? item.name}</p>
                  {item.catalog && <Badge variant="outline">{item.catalog.license}</Badge>}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{item.purpose}</p>
                {item.catalog && (
                  <a
                    href={item.catalog.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 rounded text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  >
                    View source
                    <ExternalLink className="size-3.5" aria-hidden />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <ConfirmDialog ref={confirmRef} />
    </div>
  );
}
