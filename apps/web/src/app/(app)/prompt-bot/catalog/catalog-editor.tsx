"use client";
import * as React from "react";
import { Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { call } from "@/lib/prompt-bot/client";
import { isPermissiveLicense, PERMISSIVE_LICENSES } from "@/lib/skills/license";
import type { CatalogEntryView } from "@/lib/skills/types";
import { cn } from "@/lib/utils";

type Draft = Omit<CatalogEntryView, "id" | "tags"> & { tags: string };
const EMPTY: Draft = { slug: "", name: "", description: "", sourceUrl: "https://github.com/", license: "", bundlable: false, installNotes: "", tags: "", isActive: true };
const toDraft = (e: CatalogEntryView | null): Draft =>
  e
    ? { slug: e.slug, name: e.name, description: e.description, sourceUrl: e.sourceUrl, license: e.license, bundlable: e.bundlable, installNotes: e.installNotes, tags: e.tags.join(", "), isActive: e.isActive }
    : EMPTY;

export function CatalogEditor({ initial }: { initial: CatalogEntryView[] }) {
  const [entries, setEntries] = React.useState(initial);
  const [selectedId, setSelectedId] = React.useState<string | null>(initial[0]?.id ?? null);
  const selected = entries.find((e) => e.id === selectedId) ?? null;
  const [draft, setDraft] = React.useState<Draft>(() => toDraft(selected));
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const permissive = isPermissiveLicense(draft.license.trim());
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  function select(id: string | null) {
    setSelectedId(id);
    setDraft(toDraft(entries.find((e) => e.id === id) ?? null));
    setError(null);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    const body = {
      name: draft.name,
      description: draft.description,
      sourceUrl: draft.sourceUrl,
      license: draft.license.trim(),
      bundlable: permissive && draft.bundlable,
      installNotes: draft.installNotes,
      tags: draft.tags.split(",").map((t) => t.trim()).filter(Boolean),
      isActive: draft.isActive,
    };
    const result = selected
      ? await call<CatalogEntryView>(`/api/v1/prompt-bot/skill-catalog/${selected.id}`, { method: "PATCH", body: JSON.stringify(body) })
      : await call<CatalogEntryView>("/api/v1/prompt-bot/skill-catalog", { method: "POST", body: JSON.stringify({ ...body, slug: draft.slug.trim() }) });
    setSaving(false);
    if (!result.ok) {
      const message = (result.details && Object.values(result.details).flat()[0]) || result.message;
      setError(message);
      return void toast.error(message);
    }
    const next = selected ? entries.map((e) => (e.id === result.data.id ? result.data : e)) : [...entries, result.data];
    setEntries(next);
    setSelectedId(result.data.id);
    setDraft(toDraft(result.data));
    toast.success("Catalog entry saved");
  }

  const field = "mt-1.5 bg-white/60 dark:bg-white/5";
  return (
    <div className="grid gap-5 md:grid-cols-[16rem_minmax(0,1fr)]">
      <nav aria-label="Catalog entries" className="glass h-fit rounded-[1.75rem] p-3">
        <ul className="flex flex-col gap-1">
          {entries.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => select(e.id)}
                aria-current={e.id === selectedId ? "true" : undefined}
                className={cn(
                  "w-full rounded-xl px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                  e.id === selectedId ? "bg-primary/10" : "hover:bg-white/55 dark:hover:bg-white/5",
                )}
              >
                <span className="block text-sm font-medium">{e.name}</span>
                <span className="mt-1 flex flex-wrap gap-1">
                  <Badge variant="outline">{e.license}</Badge>
                  {!e.isActive && <Badge variant="secondary">Inactive</Badge>}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => select(null)}>
          <Plus className="size-4" aria-hidden />
          Add entry
        </Button>
      </nav>

      <form onSubmit={save} className="glass flex flex-col gap-4 rounded-[1.75rem] p-5" aria-label={selected ? `Edit ${selected.name}` : "New catalog entry"}>
        {!selected && (
          <div>
            <label htmlFor="catalog-slug" className="text-sm font-medium">Slug</label>
            <Input id="catalog-slug" value={draft.slug} onChange={(e) => set("slug", e.target.value)} placeholder="kebab-case, e.g. frontend-design" className={field} />
          </div>
        )}
        <div>
          <label htmlFor="catalog-name" className="text-sm font-medium">Name</label>
          <Input id="catalog-name" value={draft.name} maxLength={80} onChange={(e) => set("name", e.target.value)} className={field} />
        </div>
        <div>
          <label htmlFor="catalog-description" className="text-sm font-medium">When it helps</label>
          <Textarea id="catalog-description" value={draft.description} maxLength={600} onChange={(e) => set("description", e.target.value)} className={cn(field, "min-h-20")} />
          <p className="mt-1 text-xs text-muted-foreground">The split step matches people&apos;s work against this text.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="catalog-source" className="text-sm font-medium">Source URL</label>
            <Input id="catalog-source" type="url" value={draft.sourceUrl} onChange={(e) => set("sourceUrl", e.target.value)} className={field} />
          </div>
          <div>
            <label htmlFor="catalog-license" className="text-sm font-medium">License</label>
            <Input id="catalog-license" value={draft.license} maxLength={64} onChange={(e) => set("license", e.target.value)} placeholder="SPDX id or source-available" className={field} />
          </div>
        </div>
        <div>
          <label htmlFor="catalog-install" className="text-sm font-medium">Install notes</label>
          <Textarea id="catalog-install" value={draft.installNotes} maxLength={1000} onChange={(e) => set("installNotes", e.target.value)} className={cn(field, "min-h-16")} />
        </div>
        <div>
          <label htmlFor="catalog-tags" className="text-sm font-medium">Tags</label>
          <Input id="catalog-tags" value={draft.tags} onChange={(e) => set("tags", e.target.value)} placeholder="Comma-separated, e.g. design, ui" className={field} />
        </div>
        <div className="flex flex-col gap-3 rounded-2xl bg-white/45 p-3 dark:bg-white/5">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="catalog-bundlable" className="text-sm font-medium">Bundlable</label>
            <Switch
              id="catalog-bundlable"
              checked={permissive && draft.bundlable}
              disabled={!permissive}
              onCheckedChange={(checked) => set("bundlable", checked)}
              aria-describedby="catalog-bundlable-help"
            />
          </div>
          <p id="catalog-bundlable-help" className="text-xs text-muted-foreground">
            Allowed only for a verified permissive license ({PERMISSIVE_LICENSES.join(", ")}), confirmed from the source repository&apos;s LICENSE file. Packs list catalog skills with a link to their source.
          </p>
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="catalog-active" className="text-sm font-medium">Active</label>
            <Switch id="catalog-active" checked={draft.isActive} onCheckedChange={(checked) => set("isActive", checked)} />
          </div>
        </div>
        {error && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <div className="flex justify-end">
          <Button type="submit" disabled={saving}>
            <Save className="size-4" aria-hidden />
            {selected ? "Save entry" : "Add to catalog"}
          </Button>
        </div>
      </form>
    </div>
  );
}
