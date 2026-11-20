"use client";

import * as React from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Eye, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { QuestionRenderer, type QuestionLike } from "./question-renderer";
import { QuestionRepositoryPicker } from "./question-repository-picker";

const QUESTION_TYPES: QuestionLike["type"][] = [
  "SHORT_ANSWER",
  "PARAGRAPH",
  "MULTIPLE_CHOICE",
  "CHECKBOXES",
  "DROPDOWN",
  "LINEAR_SCALE",
  "STAR_RATING",
  "DATE",
  "TIME",
  "FILE_UPLOAD",
  "MULTIPLE_CHOICE_GRID",
  "CHECKBOX_GRID",
];

const TYPE_LABEL: Record<QuestionLike["type"], string> = {
  SHORT_ANSWER: "Short answer",
  PARAGRAPH: "Paragraph",
  MULTIPLE_CHOICE: "Multiple choice",
  CHECKBOXES: "Checkboxes",
  DROPDOWN: "Dropdown",
  LINEAR_SCALE: "Linear scale",
  STAR_RATING: "Star rating",
  DATE: "Date",
  TIME: "Time",
  FILE_UPLOAD: "File upload",
  MULTIPLE_CHOICE_GRID: "Multiple-choice grid",
  CHECKBOX_GRID: "Checkbox grid",
};

function defaultConfigFor(type: QuestionLike["type"]): Record<string, unknown> {
  switch (type) {
    case "MULTIPLE_CHOICE":
    case "CHECKBOXES":
    case "DROPDOWN":
      return { options: ["Option 1", "Option 2"] };
    case "LINEAR_SCALE":
      return { min: 1, max: 5 };
    case "STAR_RATING":
      return { min: 1, max: 5 };
    case "MULTIPLE_CHOICE_GRID":
    case "CHECKBOX_GRID":
      return { rows: ["Row 1"], columns: ["Column 1", "Column 2"] };
    default:
      return {};
  }
}

type BuilderQuestion = {
  key: string;
  type: QuestionLike["type"];
  title: string;
  description: string;
  required: boolean;
  config: Record<string, unknown>;
  templateId?: string;
};
type BuilderSection = { key: string; title: string; description: string; questions: BuilderQuestion[] };

let keyCounter = 0;
function nextKey() {
  keyCounter += 1;
  return `local-${keyCounter}`;
}

export type FormMeta = {
  id: string;
  title: string;
  description: string | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  category: "GENERIC" | "FEEDBACK";
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.error?.message || "Request failed");
  return result.data as T;
}

export function FormBuilder({
  form,
  initialSections,
}: {
  form: FormMeta;
  initialSections: { title: string | null; description: string | null; questions: Omit<BuilderQuestion, "key">[] }[];
}) {
  const [meta, setMeta] = React.useState(form);
  const [sections, setSections] = React.useState<BuilderSection[]>(
    initialSections.map((section) => ({
      key: nextKey(),
      title: section.title ?? "",
      description: section.description ?? "",
      questions: section.questions.map((q) => ({ ...q, key: nextKey() })),
    }))
  );
  const [preview, setPreview] = React.useState(false);
  const [previewAnswers, setPreviewAnswers] = React.useState<Record<string, unknown>>({});
  const [isSaving, setIsSaving] = React.useState(false);
  const [pickerFor, setPickerFor] = React.useState<string | null>(null);

  function addSection() {
    setSections((current) => [...current, { key: nextKey(), title: "", description: "", questions: [] }]);
  }

  function removeSection(sectionKey: string) {
    setSections((current) => current.filter((s) => s.key !== sectionKey));
  }

  function updateSection(sectionKey: string, patch: Partial<BuilderSection>) {
    setSections((current) => current.map((s) => (s.key === sectionKey ? { ...s, ...patch } : s)));
  }

  function addQuestion(sectionKey: string, type: QuestionLike["type"]) {
    setSections((current) =>
      current.map((s) =>
        s.key === sectionKey
          ? {
              ...s,
              questions: [
                ...s.questions,
                { key: nextKey(), type, title: "Untitled question", description: "", required: false, config: defaultConfigFor(type) },
              ],
            }
          : s
      )
    );
  }

  function insertTemplateQuestion(sectionKey: string, template: { type: QuestionLike["type"]; title: string; description: string | null; config: unknown; id: string }) {
    setSections((current) =>
      current.map((s) =>
        s.key === sectionKey
          ? {
              ...s,
              questions: [
                ...s.questions,
                {
                  key: nextKey(),
                  type: template.type,
                  title: template.title,
                  description: template.description ?? "",
                  required: false,
                  config: (template.config as Record<string, unknown>) ?? {},
                  templateId: template.id,
                },
              ],
            }
          : s
      )
    );
    setPickerFor(null);
  }

  function updateQuestion(sectionKey: string, questionKey: string, patch: Partial<BuilderQuestion>) {
    setSections((current) =>
      current.map((s) =>
        s.key !== sectionKey
          ? s
          : { ...s, questions: s.questions.map((q) => (q.key === questionKey ? { ...q, ...patch } : q)) }
      )
    );
  }

  function removeQuestion(sectionKey: string, questionKey: string) {
    setSections((current) =>
      current.map((s) => (s.key !== sectionKey ? s : { ...s, questions: s.questions.filter((q) => q.key !== questionKey) }))
    );
  }

  function moveQuestion(sectionKey: string, questionKey: string, direction: -1 | 1) {
    setSections((current) =>
      current.map((s) => {
        if (s.key !== sectionKey) return s;
        const index = s.questions.findIndex((q) => q.key === questionKey);
        const target = index + direction;
        if (target < 0 || target >= s.questions.length) return s;
        const questions = [...s.questions];
        [questions[index], questions[target]] = [questions[target], questions[index]];
        return { ...s, questions };
      })
    );
  }

  async function saveDraft() {
    setIsSaving(true);
    try {
      await requestJson(`/api/v1/forms/${meta.id}/structure`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sections: sections.map((s) => ({
            title: s.title || undefined,
            description: s.description || undefined,
            questions: s.questions.map((q) => ({
              type: q.type,
              title: q.title,
              description: q.description || undefined,
              required: q.required,
              config: q.config,
              templateId: q.templateId,
            })),
          })),
        }),
      });
      toast.success("Draft saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save");
    } finally {
      setIsSaving(false);
    }
  }

  async function publish() {
    try {
      await saveDraft();
      const data = await requestJson<{ form: FormMeta }>(`/api/v1/forms/${meta.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "PUBLISHED" }),
      });
      setMeta(data.form);
      toast.success("Form published");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to publish");
    }
  }

  async function archive() {
    try {
      const data = await requestJson<{ form: FormMeta }>(`/api/v1/forms/${meta.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ARCHIVED" }),
      });
      setMeta(data.form);
      toast.success("Form archived");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to archive");
    }
  }

  async function saveMeta(patch: Partial<Pick<FormMeta, "title" | "description">>) {
    try {
      await requestJson(`/api/v1/forms/${meta.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save");
    }
  }

  const isDraft = meta.status === "DRAFT";

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 pb-20">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <Input
            value={meta.title}
            onChange={(e) => setMeta((m) => ({ ...m, title: e.target.value }))}
            onBlur={(e) => saveMeta({ title: e.target.value })}
            className="text-2xl font-bold"
            disabled={!isDraft}
          />
          <Textarea
            value={meta.description ?? ""}
            onChange={(e) => setMeta((m) => ({ ...m, description: e.target.value }))}
            onBlur={(e) => saveMeta({ description: e.target.value })}
            placeholder="Form description"
            className="mt-2"
            disabled={!isDraft}
          />
        </div>
        <Button variant="outline" onClick={() => setPreview((p) => !p)}>
          <Eye className="size-4" /> {preview ? "Edit" : "Preview"}
        </Button>
      </div>

      {preview ? (
        <div className="flex flex-col gap-4">
          {sections.map((section) => (
            <Card key={section.key}>
              <CardContent className="flex flex-col gap-4 p-6">
                {section.title ? <h2 className="font-semibold">{section.title}</h2> : null}
                {section.questions.map((question) => (
                  <QuestionRenderer
                    key={question.key}
                    question={{ ...question, id: question.key }}
                    value={previewAnswers[question.key]}
                    onChange={(value) => setPreviewAnswers((a) => ({ ...a, [question.key]: value }))}
                  />
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {sections.map((section) => (
            <Card key={section.key}>
              <CardContent className="flex flex-col gap-4 p-6">
                <div className="flex items-center justify-between gap-2">
                  <Input
                    placeholder="Section title (optional)"
                    value={section.title}
                    onChange={(e) => updateSection(section.key, { title: e.target.value })}
                    disabled={!isDraft}
                  />
                  <Button variant="ghost" size="icon" onClick={() => removeSection(section.key)} disabled={!isDraft} aria-label="Remove section">
                    <Trash2 className="size-4" />
                  </Button>
                </div>

                {section.questions.map((question, index) => (
                  <QuestionEditor
                    key={question.key}
                    question={question}
                    disabled={!isDraft}
                    canMoveUp={index > 0}
                    canMoveDown={index < section.questions.length - 1}
                    onChange={(patch) => updateQuestion(section.key, question.key, patch)}
                    onRemove={() => removeQuestion(section.key, question.key)}
                    onMove={(direction) => moveQuestion(section.key, question.key, direction)}
                  />
                ))}

                {isDraft ? (
                  <div className="flex flex-wrap gap-2">
                    <select
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) addQuestion(section.key, e.target.value as QuestionLike["type"]);
                        e.target.value = "";
                      }}
                    >
                      <option value="" disabled>
                        Add question...
                      </option>
                      {QUESTION_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {TYPE_LABEL[type]}
                        </option>
                      ))}
                    </select>
                    <Button variant="outline" size="sm" onClick={() => setPickerFor(section.key)}>
                      Insert from repository
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}

          {isDraft ? (
            <Button variant="outline" onClick={addSection} className="self-start">
              <Plus className="size-4" /> Add section
            </Button>
          ) : null}
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 flex justify-center border-t border-border bg-background/95 p-4 backdrop-blur">
        <div className="flex gap-2">
          {isDraft ? (
            <>
              <Button variant="outline" onClick={saveDraft} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save draft"}
              </Button>
              <Button onClick={publish} disabled={isSaving}>
                Publish
              </Button>
            </>
          ) : meta.status === "PUBLISHED" ? (
            <Button variant="destructive" onClick={archive}>
              Archive
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">This form is archived.</p>
          )}
        </div>
      </div>

      {pickerFor ? (
        <QuestionRepositoryPicker
          onSelect={(template) => insertTemplateQuestion(pickerFor, template)}
          onClose={() => setPickerFor(null)}
        />
      ) : null}
    </div>
  );
}

function QuestionEditor({
  question,
  disabled,
  canMoveUp,
  canMoveDown,
  onChange,
  onRemove,
  onMove,
}: {
  question: BuilderQuestion;
  disabled: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChange: (patch: Partial<BuilderQuestion>) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="flex items-center gap-2">
        <span className="rounded bg-muted px-2 py-1 text-xs font-medium">{TYPE_LABEL[question.type]}</span>
        <Input
          value={question.title}
          onChange={(e) => onChange({ title: e.target.value })}
          disabled={disabled}
          className="flex-1"
        />
        <Button variant="ghost" size="icon" disabled={disabled || !canMoveUp} onClick={() => onMove(-1)} aria-label="Move up">
          <ArrowUp className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" disabled={disabled || !canMoveDown} onClick={() => onMove(1)} aria-label="Move down">
          <ArrowDown className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" disabled={disabled} onClick={onRemove} aria-label="Delete question">
          <Trash2 className="size-4" />
        </Button>
      </div>
      <Input
        placeholder="Description (optional)"
        value={question.description}
        onChange={(e) => onChange({ description: e.target.value })}
        disabled={disabled}
      />
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={question.required} disabled={disabled} onCheckedChange={(checked) => onChange({ required: checked === true })} />
        Required
      </label>
      <QuestionConfigEditor question={question} disabled={disabled} onChange={onChange} />
    </div>
  );
}

function QuestionConfigEditor({
  question,
  disabled,
  onChange,
}: {
  question: BuilderQuestion;
  disabled: boolean;
  onChange: (patch: Partial<BuilderQuestion>) => void;
}) {
  const config = question.config;

  function setConfig(patch: Record<string, unknown>) {
    onChange({ config: { ...config, ...patch } });
  }

  function listEditor(field: "options" | "rows" | "columns", label: string) {
    const items = Array.isArray(config[field]) ? (config[field] as string[]) : [];
    return (
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {items.map((item, index) => (
          <div key={index} className="flex gap-1">
            <Input
              value={item}
              disabled={disabled}
              onChange={(e) => {
                const next = [...items];
                next[index] = e.target.value;
                setConfig({ [field]: next });
              }}
            />
            <Button
              variant="ghost"
              size="icon"
              disabled={disabled}
              onClick={() => setConfig({ [field]: items.filter((_, i) => i !== index) })}
              aria-label={`Remove ${label.toLowerCase()} ${index + 1}`}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" disabled={disabled} onClick={() => setConfig({ [field]: [...items, ""] })} className="self-start">
          <Plus className="size-3.5" /> Add
        </Button>
      </div>
    );
  }

  switch (question.type) {
    case "MULTIPLE_CHOICE":
    case "CHECKBOXES":
    case "DROPDOWN":
      return listEditor("options", "Options");
    case "MULTIPLE_CHOICE_GRID":
    case "CHECKBOX_GRID":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          {listEditor("rows", "Rows")}
          {listEditor("columns", "Columns")}
        </div>
      );
    case "LINEAR_SCALE":
    case "STAR_RATING":
      return (
        <div className="flex gap-3">
          <label className="flex items-center gap-2 text-sm">
            Min
            <Input
              type="number"
              className="w-20"
              disabled={disabled}
              value={(config.min as number) ?? 1}
              onChange={(e) => setConfig({ min: Number(e.target.value) })}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            Max
            <Input
              type="number"
              className="w-20"
              disabled={disabled}
              value={(config.max as number) ?? 5}
              onChange={(e) => setConfig({ max: Number(e.target.value) })}
            />
          </label>
        </div>
      );
    case "SHORT_ANSWER":
    case "PARAGRAPH":
      return (
        <label className="flex items-center gap-2 text-sm">
          Character limit (optional)
          <Input
            type="number"
            className="w-24"
            disabled={disabled}
            value={(config.maxLength as number) ?? ""}
            onChange={(e) => setConfig({ maxLength: e.target.value ? Number(e.target.value) : undefined })}
          />
        </label>
      );
    default:
      return null;
  }
}
