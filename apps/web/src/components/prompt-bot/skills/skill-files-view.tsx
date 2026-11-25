"use client";
import * as React from "react";
import { AlertTriangle, FileArchive } from "lucide-react";
import type { SkillFile } from "@/lib/skills/types";
import { FileTree, formatBytes, type FileTreeEntry } from "./file-tree";
import { SkillMarkdown } from "./skill-markdown";

type AssetEntry = { path: string; bytes: number; fileName?: string };
const utf8Bytes = (value: string) => new TextEncoder().encode(value).length;
const NO_ASSETS: AssetEntry[] = [];

/**
 * A skill's files, read-only: the tree, SKILL.md rendered, other text files as-is, and the
 * original files under assets/ described by name and size (their bytes are never shown here).
 * Shared by job version previews and legacy packs.
 */
export function SkillFilesView({ files, assets = NO_ASSETS }: { files: SkillFile[]; assets?: AssetEntry[] }) {
  const entries = React.useMemo<FileTreeEntry[]>(
    () => [...files.map((f) => ({ path: f.path, bytes: utf8Bytes(f.content) })), ...assets.map((a) => ({ path: a.path, bytes: a.bytes, asset: true }))],
    [files, assets],
  );
  const fallback = files.find((f) => f.path === "SKILL.md")?.path ?? entries[0]?.path ?? null;
  const [selected, setSelected] = React.useState<string | null>(fallback);
  const current = selected !== null && entries.some((e) => e.path === selected) ? selected : fallback;
  const file = files.find((f) => f.path === current) ?? null;
  const asset = assets.find((a) => a.path === current) ?? null;

  if (entries.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">This version has no files.</p>;

  return (
    <div className="grid gap-4 md:grid-cols-[14rem_minmax(0,1fr)]">
      <FileTree files={entries} selected={current} onSelect={setSelected} />
      <div className="min-w-0">
        {current && <p className="truncate font-mono text-sm">{current}</p>}
        {file?.path.startsWith("scripts/") && (
          <p role="note" className="mt-3 flex items-start gap-2 rounded-xl bg-warning/10 px-3 py-2 text-sm text-pretty">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            Review scripts before running them. The LMS never runs them for you.
          </p>
        )}
        {asset ? (
          <div className="mt-3 flex items-start gap-3 rounded-2xl bg-white/60 p-4 text-sm dark:bg-white/5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FileArchive className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium">{asset.fileName ?? asset.path.split("/").pop()}</p>
              <p className="text-muted-foreground">Original file · {formatBytes(asset.bytes)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Included so the skill can reuse your template exactly.</p>
            </div>
          </div>
        ) : file?.path === "SKILL.md" ? (
          <SkillMarkdown content={file.content} />
        ) : file ? (
          <pre
            aria-label={`Contents of ${file.path}`}
            tabIndex={0}
            className="mt-3 max-h-[32rem] overflow-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 whitespace-pre-wrap break-words rounded-2xl bg-white/60 p-4 font-mono text-xs leading-relaxed dark:bg-white/5"
          >
            {file.content}
          </pre>
        ) : null}
      </div>
    </div>
  );
}
