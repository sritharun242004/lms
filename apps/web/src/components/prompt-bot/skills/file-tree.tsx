"use client";
import { FileCode, FileText, Folder } from "lucide-react";
import type { SkillFile } from "@/lib/skills/types";
import { cn } from "@/lib/utils";

const FOLDER_ORDER = ["references", "scripts", "assets"];
const rank = (folder: string) => {
  const i = FOLDER_ORDER.indexOf(folder);
  return i === -1 ? FOLDER_ORDER.length : i;
};

export type FileGroup = { folder: string | null; files: SkillFile[] };

export function groupFiles(files: SkillFile[]): FileGroup[] {
  const root = files
    .filter((f) => !f.path.includes("/"))
    .sort((a, b) => (a.path === "SKILL.md" ? -1 : b.path === "SKILL.md" ? 1 : a.path.localeCompare(b.path)));
  const byFolder = new Map<string, SkillFile[]>();
  for (const file of files) {
    const slash = file.path.indexOf("/");
    if (slash === -1) continue;
    const folder = file.path.slice(0, slash);
    byFolder.set(folder, [...(byFolder.get(folder) ?? []), file]);
  }
  const folders = [...byFolder.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  return [
    ...(root.length ? [{ folder: null, files: root }] : []),
    ...folders.map((folder) => ({ folder, files: byFolder.get(folder)!.sort((a, b) => a.path.localeCompare(b.path)) })),
  ];
}

export function FileTree({ files, selected, onSelect }: { files: SkillFile[]; selected: string | null; onSelect(path: string): void }) {
  return (
    <nav aria-label="Skill files" className="h-fit rounded-2xl bg-white/45 p-2 dark:bg-white/5">
      <ul className="flex flex-col gap-2">
        {groupFiles(files).map((group) => (
          <li key={group.folder ?? "."}>
            {group.folder && (
              <p className="flex items-center gap-1.5 px-2 pt-1 font-mono text-xs text-muted-foreground">
                <Folder className="size-3.5" aria-hidden />
                {group.folder}/
              </p>
            )}
            <ul className="mt-1 flex flex-col">
              {group.files.map((file) => {
                const label = group.folder ? file.path.slice(group.folder.length + 1) : file.path;
                const Icon = file.path.startsWith("scripts/") ? FileCode : FileText;
                const current = file.path === selected;
                return (
                  <li key={file.path}>
                    <button
                      type="button"
                      onClick={() => onSelect(file.path)}
                      aria-current={current ? "true" : undefined}
                      title={file.path}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left font-mono text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                        group.folder && "pl-6",
                        current ? "bg-primary/10 text-primary" : "text-foreground hover:bg-white/60 dark:hover:bg-white/10",
                      )}
                    >
                      <Icon className="size-3.5 shrink-0" aria-hidden />
                      <span className="truncate">{label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );
}
