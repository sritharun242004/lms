"use client";
import * as React from "react";
import { toast } from "sonner";
import { patchJobSkill } from "@/lib/skills/jobs/client";
import type { JobFileView, JobSkillView } from "@/lib/skills/jobs/types";
import { cn } from "@/lib/utils";

export const FILE_SAVE_FAILED_MESSAGE = "We couldn't save the files for this skill. Check your connection and choose them again.";

type Props = {
  jobId: string;
  skill: JobSkillView;
  files: JobFileView[];
  disabled: boolean;
  onChange(skill: JobSkillView): void;
  registerFileSaves(skillId: string, pending: () => Promise<void>): () => void;
};

/**
 * Which of the task's files a skill uses. Chips show the latest choice at once; their PATCHes go one
 * at a time, in click order, and only the last reply is handed to the page, so quick clicks never undo each other.
 */
export function SkillFileChips({ jobId, skill, files, disabled, onChange, registerFileSaves }: Props) {
  const [chosenFiles, setChosenFiles] = React.useState<string[] | null>(null);
  const chosenRef = React.useRef<string[] | null>(null);
  const fileSaves = React.useRef<{ tail: Promise<void>; ticket: number; saved: JobSkillView | null }>({ tail: Promise.resolve(), ticket: 0, saved: null });
  const fileIds = chosenFiles ?? skill.fileIds;
  React.useEffect(() => registerFileSaves(skill.id, () => fileSaves.current.tail), [registerFileSaves, skill.id]);

  function toggleFile(fileId: string) {
    const current = chosenRef.current ?? skill.fileIds;
    const next = current.includes(fileId) ? current.filter((id) => id !== fileId) : [...current, fileId];
    chosenRef.current = next;
    setChosenFiles(next);
    const saves = fileSaves.current;
    const ticket = ++saves.ticket;
    saves.tail = saves.tail.then(async () => {
      try {
        const result = await patchJobSkill(jobId, skill.id, { fileIds: next });
        if (result.ok) saves.saved = result.data;
        else toast.error(result.message);
      } catch {
        // A thrown save (offline) is a refusal too: the tail stays resolved, so later clicks, Generate and Suggest go on.
        toast.error(FILE_SAVE_FAILED_MESSAGE);
      }
      if (ticket !== saves.ticket) return;
      // The last click has its reply: show what the server kept (the last accepted change).
      chosenRef.current = null;
      setChosenFiles(null);
      if (saves.saved) onChange(saves.saved);
      saves.saved = null;
    });
  }

  return (
    <fieldset className="mt-4">
      <legend className="text-xs font-medium text-muted-foreground">
        Files this skill uses<span className="sr-only">: {skill.name}</span>
      </legend>
      {files.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">No files in this task yet. Add them to your questions.</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {files.map((f) => {
            const on = fileIds.includes(f.id);
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={on}
                disabled={disabled}
                onClick={() => void toggleFile(f.id)}
                className={cn(
                  "min-h-11 max-w-full truncate rounded-full px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50 sm:min-h-9",
                  on
                    ? "bg-primary/10 text-primary ring-1 ring-primary/30"
                    : "bg-white/55 text-muted-foreground ring-1 ring-border/60 hover:text-foreground dark:bg-white/5",
                )}
              >
                {f.fileName}
              </button>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}
