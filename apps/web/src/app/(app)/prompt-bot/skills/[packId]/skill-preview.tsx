"use client";
import * as React from "react";
import { AlertTriangle, Download, Loader2, PackageOpen, RotateCcw, Save, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, type ConfirmDialogHandle } from "@/components/ui/confirm-dialog";
import { Textarea } from "@/components/ui/textarea";
import { FileTree } from "@/components/prompt-bot/skills/file-tree";
import { SkillMarkdown } from "@/components/prompt-bot/skills/skill-markdown";
import { downloadZip, requestGenerate, saveItemFiles, skillPackUrl } from "@/lib/skills/client";
import type { SkillFile, SkillItemView } from "@/lib/skills/types";
import { cn } from "@/lib/utils";
import { REPLACE_FILES_CONFIRM } from "./skill-refine";

type Props = {
  packId: string;
  item: SkillItemView;
  readyCount: number;
  onItemChange(item: SkillItemView): void;
  onRefine(): void;
  onDirtyChange(dirty: boolean): void;
};

const firstFile = (files: SkillFile[]) => files.find((f) => f.path === "SKILL.md")?.path ?? files[0]?.path ?? null;

/**
 * One skill: files, rendered SKILL.md, editor, downloads. The pack page owns polling while a skill
 * is being written and hands the finished item back as a new `item` prop.
 */
export function SkillPreview({ packId, item, readyCount, onItemChange, onRefine, onDirtyChange }: Props) {
  const [saved, setSaved] = React.useState<SkillFile[]>(item.files ?? []);
  const [files, setFiles] = React.useState<SkillFile[]>(item.files ?? []);
  // Errors of a failed Save belong to the edits on screen; item.validationErrors belong to a generation attempt.
  const [saveErrors, setSaveErrors] = React.useState<string[]>([]);
  const [selected, setSelected] = React.useState<string | null>(() => firstFile(item.files ?? []));
  const [mode, setMode] = React.useState<"preview" | "edit">("preview");
  const [busy, setBusy] = React.useState<"save" | "retry" | null>(null);
  const confirmRef = React.useRef<ConfirmDialogHandle>(null);
  const status = item.status;
  const generating = status === "GENERATING";
  const dirty = JSON.stringify(files) !== JSON.stringify(saved);
  const current = files.find((f) => f.path === selected) ?? null;

  React.useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  const applied = React.useRef(item);
  const show = React.useCallback((next: SkillItemView) => {
    const nextFiles = next.files ?? [];
    setSaved(nextFiles);
    setFiles(nextFiles);
    setSaveErrors([]);
    setSelected((path) => (path && nextFiles.some((f) => f.path === path) ? path : firstFile(nextFiles)));
  }, []);
  React.useEffect(() => {
    if (item === applied.current) return;
    applied.current = item;
    show(item);
  }, [item, show]);

  function adopt(next: SkillItemView) {
    applied.current = next;
    onItemChange(next);
    show(next);
  }

  function updateFile(path: string, content: string) {
    setFiles((prev) => prev.map((f) => (f.path === path ? { ...f, content } : f)));
  }

  async function save() {
    setBusy("save");
    const result = await saveItemFiles(packId, item.id, files);
    setBusy(null);
    if (!result.ok) {
      setSaveErrors(result.details?.files ?? [result.message]);
      return;
    }
    adopt(result.data);
    toast.success("Skill saved");
  }

  async function retry() {
    if (saved.length > 0 && !(await confirmRef.current?.open(REPLACE_FILES_CONFIRM))) return;
    setBusy("retry");
    const result = await requestGenerate(packId, item.id);
    setBusy(null);
    if (!result.ok) return void toast.error(result.message);
    adopt(result.data);
  }

  async function download(url: string) {
    const result = await downloadZip(url);
    if (!result.ok) toast.error(result.message);
  }

  const toggle = (value: "preview" | "edit", label: string) => (
    <button
      type="button"
      aria-pressed={mode === value}
      onClick={() => setMode(value)}
      className={cn(
        "rounded-lg px-2.5 py-1 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
        mode === value ? "bg-white text-foreground shadow-sm dark:bg-white/15" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );

  return (
    <section className="glass rounded-[1.75rem] p-5" aria-labelledby="preview-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="preview-heading" className="truncate font-mono text-lg font-semibold">{item.name}</h2>
          <p className="text-sm text-muted-foreground">{item.purpose}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={status !== "READY" || dirty} onClick={() => void download(`${skillPackUrl(packId)}/items/${item.id}/download`)}>
            <Download className="size-4" aria-hidden />
            Download skill
          </Button>
          <Button size="sm" disabled={readyCount === 0 || dirty} onClick={() => void download(`${skillPackUrl(packId)}/download`)}>
            <PackageOpen className="size-4" aria-hidden />
            Download pack
          </Button>
        </div>
      </div>

      {generating && (
        <p role="status" className="mt-4 flex items-center gap-2 rounded-xl bg-primary/5 px-3 py-2 text-sm">
          <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
          Writing your skill. This can take a minute or two.
        </p>
      )}
      {status === "READY" && item.validationErrors.length > 0 && (
        <div role="status" className="mt-4 rounded-2xl bg-warning/10 p-4 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4" aria-hidden />
            The new version couldn&apos;t be generated cleanly, so your previous files were kept
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {item.validationErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {!generating && status === "FAILED" && (
        <div role="alert" className="mt-4 rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4" aria-hidden />
            The skill couldn&apos;t be generated cleanly
          </p>
          {item.validationErrors.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {item.validationErrors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void retry()} disabled={busy !== null || dirty}>
            {busy === "retry" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RotateCcw className="size-4" aria-hidden />}
            Retry generation
          </Button>
          {dirty && <p className="mt-2 text-xs">Save or undo your edits first. Retrying would replace them.</p>}
        </div>
      )}
      {saveErrors.length > 0 && (
        <div role="alert" className="mt-4 rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4" aria-hidden />
            Your changes weren&apos;t saved. Fix these and save again.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {saveErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {files.length === 0 ? (
        !generating && (
          <div className="mt-6 flex flex-col items-center gap-3 py-6 text-center text-sm text-muted-foreground">
            <p>This skill hasn&apos;t been written yet.</p>
            <Button onClick={onRefine}>
              <Wand2 className="size-4" aria-hidden />
              Refine and generate
            </Button>
          </div>
        )
      ) : (
        <div className="mt-5 grid gap-4 md:grid-cols-[14rem_minmax(0,1fr)]">
          <FileTree
            files={files}
            selected={selected}
            onSelect={(path) => {
              setSelected(path);
              setMode("preview");
            }}
          />
          <div className="min-w-0">
            {current && (
              <>
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-mono text-sm">{current.path}</p>
                  {current.path === "SKILL.md" && (
                    <div role="group" aria-label="View" className="flex rounded-xl bg-muted p-0.5 text-xs dark:bg-white/5">
                      {toggle("preview", "Preview")}
                      {toggle("edit", "Edit")}
                    </div>
                  )}
                </div>
                {current.path.startsWith("scripts/") && (
                  <p role="note" className="mt-3 flex items-start gap-2 rounded-xl bg-amber-400/15 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                    Review scripts before running them. The LMS never runs them for you.
                  </p>
                )}
                {current.path === "SKILL.md" && mode === "preview" ? (
                  <SkillMarkdown content={current.content} />
                ) : (
                  <Textarea
                    aria-label={`Contents of ${current.path}`}
                    value={current.content}
                    disabled={generating}
                    spellCheck={false}
                    onChange={(e) => updateFile(current.path, e.target.value)}
                    className="mt-3 min-h-[26rem] bg-white/60 font-mono text-xs leading-relaxed dark:bg-white/5"
                  />
                )}
              </>
            )}
          </div>
        </div>
      )}

      {files.length > 0 && (
        <div className="mt-4 flex items-center justify-end gap-3">
          {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
          <Button onClick={() => void save()} disabled={generating || busy !== null || !(dirty || status === "FAILED")}>
            {busy === "save" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
            Save and check
          </Button>
        </div>
      )}
      <ConfirmDialog ref={confirmRef} />
    </section>
  );
}
