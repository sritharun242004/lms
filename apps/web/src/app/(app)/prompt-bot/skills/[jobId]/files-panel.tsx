"use client";
import type { JobFileView } from "@/lib/skills/jobs/types";

/** Replaced in Task 19. */
export function FilesPanel(props: { jobId: string; files: JobFileView[]; aiConfigured: boolean; onFileChange(file: JobFileView): void; onFileRemoved(fileId: string): void }) {
  return <p className="text-sm text-muted-foreground">{props.files.length} files</p>;
}
