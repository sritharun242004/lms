"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { QuestionLike } from "./question-renderer";

export type QuestionTemplate = {
  id: string;
  title: string;
  type: QuestionLike["type"];
  description: string | null;
  config: unknown;
};

export function QuestionRepositoryPicker({
  onSelect,
  onClose,
}: {
  onSelect: (template: QuestionTemplate) => void;
  onClose: () => void;
}) {
  const [templates, setTemplates] = React.useState<QuestionTemplate[]>([]);
  const [search, setSearch] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    fetch("/api/v1/forms/question-templates")
      .then((res) => res.json())
      .then((result) => {
        if (result.success) setTemplates(result.data.templates);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const filtered = templates.filter((t) => t.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[70vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Question repository</DialogTitle>
        </DialogHeader>
        <Input placeholder="Search questions" value={search} onChange={(e) => setSearch(e.target.value)} />
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No saved questions yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((template) => (
              <div key={template.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm font-medium">{template.title}</p>
                  <p className="text-xs text-muted-foreground">{template.type}</p>
                </div>
                <Button size="sm" onClick={() => onSelect(template)}>
                  Insert
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
