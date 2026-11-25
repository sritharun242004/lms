"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlignLeft,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CalendarDays,
  ChevronDown,
  CircleChevronDown,
  CircleDot,
  Clock,
  Copy,
  Eye,
  Grid3x3,
  LayoutGrid,
  Library,
  Plus,
  Rows3,
  Share2,
  SlidersHorizontal,
  SquareCheck,
  Star,
  Text,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { initialAnswers } from "@/lib/forms/prefill";
import { publicFormPath } from "@/lib/forms/public-link";
import { QuestionRenderer, type QuestionLike } from "./question-renderer";
import { QuestionRepositoryPicker } from "./question-repository-picker";

type QuestionType = QuestionLike["type"];
type TypeInfo = { type: QuestionType; label: string; icon: React.ElementType };

// Grouped the way people think about them, as Google Forms does.
const TYPE_GROUPS: { label: string; types: TypeInfo[] }[] = [
  {
    label: "Text",
    types: [
      { type: "SHORT_ANSWER", label: "Short answer", icon: Text },
      { type: "PARAGRAPH", label: "Paragraph", icon: AlignLeft },
    ],
  },
  {
    label: "Choice",
    types: [
      { type: "MULTIPLE_CHOICE", label: "Multiple choice", icon: CircleDot },
      { type: "CHECKBOXES", label: "Checkboxes", icon: SquareCheck },
      { type: "DROPDOWN", label: "Dropdown", icon: CircleChevronDown },
    ],
  },
  {
    label: "Rating & grid",
    types: [
      { type: "LINEAR_SCALE", label: "Linear scale", icon: SlidersHorizontal },
      { type: "STAR_RATING", label: "Star rating", icon: Star },
      { type: "MULTIPLE_CHOICE_GRID", label: "Multiple-choice grid", icon: Grid3x3 },
      { type: "CHECKBOX_GRID", label: "Checkbox grid", icon: LayoutGrid },
    ],
  },
  {
    label: "Other",
    types: [
      { type: "DATE", label: "Date", icon: CalendarDays },
      { type: "TIME", label: "Time", icon: Clock },
      { type: "FILE_UPLOAD", label: "File upload", icon: Upload },
    ],
  },
];
const TYPE_INFO = Object.fromEntries(TYPE_GROUPS.flatMap((g) => g.types).map((t) => [t.type, t])) as Record<
  QuestionType,
  TypeInfo
>;

const CHOICE_TYPES: QuestionType[] = ["MULTIPLE_CHOICE", "CHECKBOXES", "DROPDOWN"];
const GRID_TYPES: QuestionType[] = ["MULTIPLE_CHOICE_GRID", "CHECKBOX_GRID"];

function defaultConfigFor(type: QuestionType): Record<string, unknown> {
  if (CHOICE_TYPES.includes(type)) return { options: ["Option 1"] };
  if (type === "LINEAR_SCALE" || type === "STAR_RATING") return { min: 1, max: 5 };
  if (GRID_TYPES.includes(type)) return { rows: ["Row 1"], columns: ["Column 1"] };
  return {};
}

// Switching type keeps whatever still makes sense — options survive a move
// between choice types — and resets the rest, so nothing invalid is saved.
function configForTypeChange(from: QuestionType, to: QuestionType, config: Record<string, unknown>) {
  if (CHOICE_TYPES.includes(from) && CHOICE_TYPES.includes(to)) return { options: config.options };
  if (GRID_TYPES.includes(from) && GRID_TYPES.includes(to)) return { rows: config.rows, columns: config.columns };
  return defaultConfigFor(to);
}

type BuilderQuestion = {
  key: string;
  type: QuestionType;
  title: string;
  description: string;
  required: boolean;
  config: Record<string, unknown>;
  templateId?: string;
};
type BuilderSection = { key: string; title: string; description: string; questions: BuilderQuestion[] };

// Keys for things added while editing. Questions loaded with the page get
// positional keys instead (see the initial state), because this counter runs
// separately on the server and in the browser and would make the first
// render disagree (radio groups are named by key).
let keyCounter = 0;
function nextKey() {
  keyCounter += 1;
  return `new-${keyCounter}`;
}

function newQuestion(type: QuestionType = "MULTIPLE_CHOICE"): BuilderQuestion {
  return { key: nextKey(), type, title: "", description: "", required: false, config: defaultConfigFor(type) };
}

export type FormMeta = {
  id: string;
  title: string;
  description: string | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  category: "GENERIC" | "FEEDBACK";
  isTemplate: boolean;
  publicLinkEnabled: boolean;
};

type SaveState = "saved" | "unsaved" | "saving" | "error";

const AUTOSAVE_DELAY_MS = 800;

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
  const [sections, setSections] = React.useState<BuilderSection[]>(() => {
    const loaded = initialSections.map((section, s) => ({
      key: `s${s}`,
      title: section.title ?? "",
      description: section.description ?? "",
      questions: section.questions.map((q, i) => ({ ...q, key: `s${s}-q${i}` })),
    }));
    // A new form opens ready to type into, like a blank Google Form.
    return loaded.length > 0
      ? loaded
      : [{ key: "s0", title: "", description: "", questions: [{ ...newQuestion(), key: "s0-q0" }] }];
  });
  const [activeKey, setActiveKey] = React.useState<string | null>(() =>
    initialSections.length === 0 && form.status === "DRAFT" ? sections[0]?.questions[0]?.key ?? null : null
  );
  const [preview, setPreview] = React.useState(false);
  const [previewAnswers, setPreviewAnswers] = React.useState<Record<string, unknown>>({});
  const [saveState, setSaveState] = React.useState<SaveState>("saved");
  const [shareOpen, setShareOpen] = React.useState(false);
  const [pickerOpen, setPickerOpen] = React.useState(false);

  const isDraft = meta.status === "DRAFT";
  const editable = isDraft && !preview;

  // --- saving -------------------------------------------------------------

  const sectionsRef = React.useRef(sections);
  React.useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);
  const skipFirstSave = React.useRef(initialSections.length > 0);
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveStructure = React.useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    setSaveState("saving");
    try {
      await requestJson(`/api/v1/forms/${meta.id}/structure`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sections: sectionsRef.current.map((s) => ({
            title: s.title || undefined,
            description: s.description || undefined,
            questions: s.questions.map((q) => ({
              type: q.type,
              title: q.title.trim() || "Untitled question",
              description: q.description || undefined,
              required: q.required,
              config: q.config,
              templateId: q.templateId,
            })),
          })),
        }),
      });
      setSaveState("saved");
      return true;
    } catch (error) {
      setSaveState("error");
      toast.error(error instanceof Error ? error.message : "Couldn't save your changes");
      return false;
    }
  }, [meta.id]);

  // Every edit saves itself shortly after typing stops — there is no Save button.
  React.useEffect(() => {
    if (!isDraft) return;
    if (skipFirstSave.current) {
      skipFirstSave.current = false;
      return;
    }
    setSaveState("unsaved");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void saveStructure(), AUTOSAVE_DELAY_MS);
  }, [sections, isDraft, saveStructure]);

  React.useEffect(() => {
    if (saveState !== "unsaved" && saveState !== "saving") return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState]);

  async function saveMeta(patch: Partial<Pick<FormMeta, "title" | "description" | "isTemplate" | "publicLinkEnabled">>) {
    try {
      await requestJson(`/api/v1/forms/${meta.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save");
      return false;
    }
  }

  // Switches update instantly and roll back if the save fails, so what the
  // switch shows is always what the server has.
  async function toggleMeta(field: "isTemplate" | "publicLinkEnabled", value: boolean) {
    setMeta((m) => ({ ...m, [field]: value }));
    if (!(await saveMeta({ [field]: value }))) setMeta((m) => ({ ...m, [field]: !value }));
  }

  async function changeStatus(status: "PUBLISHED" | "ARCHIVED") {
    if (status === "PUBLISHED" && !(await saveStructure())) return;
    try {
      const data = await requestJson<{ form: FormMeta }>(`/api/v1/forms/${meta.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setMeta((m) => ({ ...m, status: data.form.status }));
      setActiveKey(null);
      if (status === "PUBLISHED") {
        toast.success("Form published");
        setShareOpen(true);
      } else {
        toast.success("Form archived");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't update the form");
    }
  }

  // --- editing ------------------------------------------------------------

  function locate(questionKey: string | null) {
    for (let s = 0; s < sections.length; s += 1) {
      const q = sections[s].questions.findIndex((question) => question.key === questionKey);
      if (q !== -1) return { s, q };
    }
    return null;
  }

  function updateQuestion(questionKey: string, patch: Partial<BuilderQuestion>) {
    setSections((current) =>
      current.map((s) => ({
        ...s,
        questions: s.questions.map((q) => (q.key === questionKey ? { ...q, ...patch } : q)),
      }))
    );
  }

  // New questions go right after the one you're on (or at the end), and
  // become the one you're on — so "+" always does the obvious thing.
  function insertQuestion(question: BuilderQuestion) {
    const at = locate(activeKey);
    setSections((current) =>
      current.map((s, index) => {
        if (at ? index !== at.s : index !== current.length - 1) return s;
        const questions = [...s.questions];
        questions.splice(at ? at.q + 1 : questions.length, 0, question);
        return { ...s, questions };
      })
    );
    setActiveKey(question.key);
  }

  function duplicateQuestion(questionKey: string) {
    const at = locate(questionKey);
    if (!at) return;
    const source = sections[at.s].questions[at.q];
    const copy = { ...source, key: nextKey(), config: structuredClone(source.config) };
    setSections((current) =>
      current.map((s, index) => {
        if (index !== at.s) return s;
        const questions = [...s.questions];
        questions.splice(at.q + 1, 0, copy);
        return { ...s, questions };
      })
    );
    setActiveKey(copy.key);
  }

  function moveQuestion(questionKey: string, direction: -1 | 1) {
    setSections((current) =>
      current.map((s) => {
        const index = s.questions.findIndex((q) => q.key === questionKey);
        const target = index + direction;
        if (index === -1 || target < 0 || target >= s.questions.length) return s;
        const questions = [...s.questions];
        [questions[index], questions[target]] = [questions[target], questions[index]];
        return { ...s, questions };
      })
    );
  }

  function removeQuestion(questionKey: string) {
    setSections((current) => current.map((s) => ({ ...s, questions: s.questions.filter((q) => q.key !== questionKey) })));
    setActiveKey(null);
  }

  function addSection() {
    const question = newQuestion();
    setSections((current) => [...current, { key: nextKey(), title: "", description: "", questions: [question] }]);
    setActiveKey(question.key);
  }

  function updateSection(sectionKey: string, patch: Partial<BuilderSection>) {
    setSections((current) => current.map((s) => (s.key === sectionKey ? { ...s, ...patch } : s)));
  }

  function removeSection(sectionKey: string) {
    // Its questions move up into the section before, as in Google Forms,
    // so deleting a section never silently deletes questions.
    setSections((current) => {
      const index = current.findIndex((s) => s.key === sectionKey);
      if (index <= 0) return current;
      const next = current.filter((s) => s.key !== sectionKey);
      next[index - 1] = { ...next[index - 1], questions: [...next[index - 1].questions, ...current[index].questions] };
      return next;
    });
  }

  function startPreview() {
    setPreviewAnswers(
      initialAnswers(sections.flatMap((s) => s.questions.map((q) => ({ id: q.key, type: q.type, config: q.config }))))
    );
    setActiveKey(null);
    setPreview(true);
  }

  const totalQuestions = sections.reduce((sum, s) => sum + s.questions.length, 0);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 pb-28 lg:pb-12">
      {/* Top bar: where you are, whether it's saved, and the actions that matter. */}
      <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-background/90 px-2 py-2 shadow-sm backdrop-blur sm:px-3">
        <Button asChild variant="ghost" size="icon" aria-label="Back to forms">
          <Link href="/forms">
            <ArrowLeft />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{meta.title || "Untitled form"}</p>
          <p className="truncate text-xs text-muted-foreground" aria-live="polite">
            {!isDraft
              ? meta.status === "PUBLISHED"
                ? "Published · accepting responses"
                : "Archived"
              : saveState === "saving"
                ? "Saving…"
                : saveState === "unsaved"
                  ? "Unsaved changes"
                  : saveState === "error"
                    ? "Couldn't save — check your connection"
                    : "All changes saved"}
          </p>
        </div>
        <Button
          variant={preview ? "secondary" : "ghost"}
          size="icon"
          aria-label={preview ? "Back to editing" : "Preview"}
          title={preview ? "Back to editing" : "Preview"}
          onClick={() => (preview ? setPreview(false) : startPreview())}
        >
          <Eye />
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShareOpen(true)} aria-label="Share">
          <Share2 className="size-4" />
          <span className="hidden sm:inline">Share</span>
        </Button>
        {meta.isTemplate ? (
          // A template is only ever copied, never published or filled in.
          <Badge variant="outline" className="h-8 px-3">
            Template
          </Badge>
        ) : isDraft ? (
          <Button size="sm" onClick={() => changeStatus("PUBLISHED")} disabled={saveState === "saving"}>
            Publish
          </Button>
        ) : meta.status === "PUBLISHED" ? (
          <Button size="sm" variant="outline" onClick={() => changeStatus("ARCHIVED")}>
            Archive
          </Button>
        ) : null}
      </div>

      {preview ? (
        <p className="rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary">
          Preview — this is what people will see. Answers here aren&apos;t saved.
        </p>
      ) : !isDraft ? (
        <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
          {meta.status === "PUBLISHED"
            ? "This form is live, so its questions are locked to protect the answers already collected. To change it, duplicate it from the Forms list."
            : "This form is archived and read-only."}
        </p>
      ) : null}

      {/* Title card */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 pt-7 sm:p-6 sm:pt-8">
        <span className="absolute inset-x-0 top-0 h-1.5 bg-primary" aria-hidden="true" />
        {editable ? (
          <>
            <input
              value={meta.title}
              onChange={(e) => setMeta((m) => ({ ...m, title: e.target.value }))}
              onBlur={(e) => void saveMeta({ title: e.target.value.trim() || "Untitled form" })}
              placeholder="Untitled form"
              aria-label="Form title"
              className="w-full border-b border-transparent bg-transparent pb-1 text-2xl font-bold tracking-tight outline-none transition-colors hover:border-border focus:border-primary sm:text-3xl"
            />
            <AutoGrowTextarea
              value={meta.description ?? ""}
              onChange={(value) => setMeta((m) => ({ ...m, description: value }))}
              onBlur={(value) => void saveMeta({ description: value })}
              placeholder="Form description"
              ariaLabel="Form description"
              className="mt-3 text-sm text-muted-foreground"
            />
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{meta.title}</h1>
            {meta.description ? <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">{meta.description}</p> : null}
          </>
        )}
      </div>

      {sections.map((section, sectionIndex) => (
        <React.Fragment key={section.key}>
          {sections.length > 1 ? (
            <div className="mt-2 flex flex-col">
              <span className="self-start rounded-t-lg bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                Section {sectionIndex + 1} of {sections.length}
              </span>
              <div className="rounded-2xl rounded-tl-none border border-border bg-card p-5">
                {editable ? (
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      <input
                        value={section.title}
                        onChange={(e) => updateSection(section.key, { title: e.target.value })}
                        placeholder="Untitled section"
                        aria-label={`Section ${sectionIndex + 1} title`}
                        className="w-full border-b border-transparent bg-transparent pb-1 text-lg font-semibold outline-none hover:border-border focus:border-primary"
                      />
                      <AutoGrowTextarea
                        value={section.description}
                        onChange={(value) => updateSection(section.key, { description: value })}
                        placeholder="Description (optional)"
                        ariaLabel={`Section ${sectionIndex + 1} description`}
                        className="mt-2 text-sm text-muted-foreground"
                      />
                    </div>
                    {sectionIndex > 0 ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeSection(section.key)}
                        aria-label={`Remove section ${sectionIndex + 1}`}
                        title="Remove section (its questions move up)"
                      >
                        <X />
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <>
                    <h2 className="text-lg font-semibold">{section.title || `Section ${sectionIndex + 1}`}</h2>
                    {section.description ? <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{section.description}</p> : null}
                  </>
                )}
              </div>
            </div>
          ) : null}

          {section.questions.map((question, questionIndex) =>
            !editable ? (
              <div key={question.key} className="rounded-2xl border border-border bg-card p-2 [&>div]:border-0">
                <QuestionRenderer
                  question={{ ...question, id: question.key, title: question.title || "Untitled question" }}
                  value={previewAnswers[question.key]}
                  onChange={(value) => setPreviewAnswers((a) => ({ ...a, [question.key]: value }))}
                  disabled={!preview}
                />
              </div>
            ) : (
              <QuestionCard
                key={question.key}
                question={question}
                active={activeKey === question.key}
                canMoveUp={questionIndex > 0}
                canMoveDown={questionIndex < section.questions.length - 1}
                canRemove={totalQuestions > 1}
                onActivate={() => setActiveKey(question.key)}
                onChange={(patch) => updateQuestion(question.key, patch)}
                onMove={(direction) => moveQuestion(question.key, direction)}
                onDuplicate={() => duplicateQuestion(question.key)}
                onRemove={() => removeQuestion(question.key)}
              />
            )
          )}
        </React.Fragment>
      ))}

      {preview ? (
        <Button className="self-start" disabled>
          Submit
        </Button>
      ) : null}

      {editable ? (
        // On wide screens this floats beside the form; on phones it sits at
        // the bottom of the screen, always within thumb reach.
        <div
          role="toolbar"
          aria-label="Add to form"
          className="fixed inset-x-0 bottom-0 z-20 flex justify-center gap-1 border-t border-border bg-background/95 p-2 backdrop-blur lg:inset-x-auto lg:top-1/3 lg:right-[max(1rem,calc(50%-29.5rem))] lg:bottom-auto lg:flex-col lg:rounded-2xl lg:border lg:shadow-md"
        >
          <ToolbarButton label="Add question" shortLabel="Question" onClick={() => insertQuestion(newQuestion())} icon={Plus} />
          <ToolbarButton label="Add from question library" shortLabel="Library" onClick={() => setPickerOpen(true)} icon={Library} />
          <ToolbarButton label="Add section" shortLabel="Section" onClick={addSection} icon={Rows3} />
        </div>
      ) : null}

      {pickerOpen ? (
        <QuestionRepositoryPicker
          onSelect={(template) => {
            insertQuestion({
              key: nextKey(),
              type: template.type,
              title: template.title,
              description: template.description ?? "",
              required: false,
              config: (template.config as Record<string, unknown>) ?? {},
              templateId: template.id,
            });
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}

      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        meta={meta}
        linkParams={sections.flatMap((s) =>
          s.questions
            .map((q) => (q.type === "SHORT_ANSWER" && typeof q.config.urlParam === "string" ? q.config.urlParam : ""))
            .filter(Boolean)
        )}
        onToggle={toggleMeta}
      />
    </div>
  );
}

function ToolbarButton({
  label,
  shortLabel,
  onClick,
  icon: Icon,
}: {
  label: string;
  shortLabel: string;
  onClick: () => void;
  icon: React.ElementType;
}) {
  return (
    <Button variant="ghost" onClick={onClick} aria-label={label} title={label} className="h-11 gap-2 px-3 lg:size-11 lg:px-0">
      <Icon className="size-5" />
      <span className="text-sm lg:sr-only">{shortLabel}</span>
    </Button>
  );
}

function AutoGrowTextarea({
  value,
  onChange,
  onBlur,
  placeholder,
  ariaLabel,
  className = "",
  textareaRef,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur?: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  className?: string;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const ownRef = React.useRef<HTMLTextAreaElement>(null);
  const ref = textareaRef ?? ownRef;
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value, ref]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => onBlur?.(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={`block w-full resize-none overflow-hidden border-b border-transparent bg-transparent pb-1 outline-none transition-colors hover:border-border focus:border-primary ${className}`}
    />
  );
}

function QuestionCard({
  question,
  active,
  canMoveUp,
  canMoveDown,
  canRemove,
  onActivate,
  onChange,
  onMove,
  onDuplicate,
  onRemove,
}: {
  question: BuilderQuestion;
  active: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  canRemove: boolean;
  onActivate: () => void;
  onChange: (patch: Partial<BuilderQuestion>) => void;
  onMove: (direction: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const titleRef = React.useRef<HTMLTextAreaElement>(null);
  const wasActive = React.useRef(active);
  React.useEffect(() => {
    // Opening a brand-new, untitled question puts the cursor in its title.
    if (active && !wasActive.current && !question.title) titleRef.current?.focus();
    wasActive.current = active;
  }, [active, question.title]);

  if (!active) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onActivate}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onActivate();
          }
        }}
        aria-label={`Edit question: ${question.title || "Untitled question"}`}
        className="cursor-pointer rounded-2xl border border-border bg-card p-2 transition-shadow duration-200 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none [&_div.rounded-lg.border]:border-0"
      >
        <div className="pointer-events-none" aria-hidden="true">
          <QuestionRenderer
            question={{ ...question, id: question.key, title: question.title || "Untitled question" }}
            value={question.type === "SHORT_ANSWER" ? question.config.defaultValue : undefined}
            onChange={() => {}}
            disabled
          />
        </div>
      </div>
    );
  }

  const Icon = TYPE_INFO[question.type].icon;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-primary/40 bg-card p-4 shadow-md ring-2 ring-primary/15 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex-1 rounded-lg bg-muted/60 px-3 pt-2">
          <AutoGrowTextarea
            textareaRef={titleRef}
            value={question.title}
            onChange={(title) => onChange({ title })}
            placeholder="Question"
            ariaLabel="Question"
            className="border-b-2 !border-border pb-2 text-base font-medium focus:!border-primary"
          />
        </div>
        <label className="relative flex h-11 items-center sm:w-56">
          <span className="sr-only">Question type</span>
          <Icon className="pointer-events-none absolute left-3 size-4 text-muted-foreground" aria-hidden="true" />
          <select
            value={question.type}
            onChange={(e) => {
              const type = e.target.value as QuestionType;
              onChange({ type, config: configForTypeChange(question.type, type, question.config) });
            }}
            className="h-11 w-full appearance-none rounded-lg border border-input bg-background pr-9 pl-9 text-sm"
          >
            {TYPE_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.types.map((t) => (
                  <option key={t.type} value={t.type}>
                    {t.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 size-4 text-muted-foreground" aria-hidden="true" />
        </label>
      </div>

      <input
        value={question.description}
        onChange={(e) => onChange({ description: e.target.value })}
        placeholder="Description (optional)"
        aria-label="Question description"
        className="border-b border-transparent bg-transparent pb-1 text-sm text-muted-foreground outline-none hover:border-border focus:border-primary"
      />

      <AnswerEditor question={question} onChange={onChange} />

      <div className="flex flex-wrap items-center justify-end gap-1 border-t border-border pt-3">
        <Button variant="ghost" size="icon" onClick={() => onMove(-1)} disabled={!canMoveUp} aria-label="Move question up" title="Move up">
          <ArrowUp />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => onMove(1)} disabled={!canMoveDown} aria-label="Move question down" title="Move down">
          <ArrowDown />
        </Button>
        <Button variant="ghost" size="icon" onClick={onDuplicate} aria-label="Duplicate question" title="Duplicate">
          <Copy />
        </Button>
        <Button variant="ghost" size="icon" onClick={onRemove} disabled={!canRemove} aria-label="Delete question" title="Delete">
          <Trash2 />
        </Button>
        <span className="mx-2 h-6 w-px bg-border" aria-hidden="true" />
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
          Required
          <Switch checked={question.required} onCheckedChange={(checked) => onChange({ required: checked })} />
        </label>
      </div>
    </div>
  );
}

// What the answer area looks like while editing: the same shapes people will
// see (○ / ☐ / numbered), so there is nothing to translate in your head.
function AnswerEditor({ question, onChange }: { question: BuilderQuestion; onChange: (patch: Partial<BuilderQuestion>) => void }) {
  const config = question.config;
  const setConfig = (patch: Record<string, unknown>) => onChange({ config: { ...config, ...patch } });

  if (CHOICE_TYPES.includes(question.type)) {
    const options = Array.isArray(config.options) ? (config.options as string[]) : [];
    const marker = (index: number) =>
      question.type === "MULTIPLE_CHOICE" ? (
        <span className="size-4 shrink-0 rounded-full border-2 border-muted-foreground/50" aria-hidden="true" />
      ) : question.type === "CHECKBOXES" ? (
        <span className="size-4 shrink-0 rounded-sm border-2 border-muted-foreground/50" aria-hidden="true" />
      ) : (
        <span className="w-5 shrink-0 text-right text-sm text-muted-foreground" aria-hidden="true">
          {index + 1}.
        </span>
      );
    return (
      <div className="flex flex-col">
        <OptionList items={options} label="Option" marker={marker} onChange={(next) => setConfig({ options: next })} />
        {question.type !== "DROPDOWN" ? (
          <label className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox checked={config.allowOther === true} onCheckedChange={(c) => setConfig({ allowOther: c === true || undefined })} />
            Add an &ldquo;Other&rdquo; answer
          </label>
        ) : null}
      </div>
    );
  }

  if (GRID_TYPES.includes(question.type)) {
    const rows = Array.isArray(config.rows) ? (config.rows as string[]) : [];
    const columns = Array.isArray(config.columns) ? (config.columns as string[]) : [];
    const columnShape = question.type === "MULTIPLE_CHOICE_GRID" ? "rounded-full" : "rounded-sm";
    return (
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-sm font-medium">Rows</p>
          <OptionList
            items={rows}
            label="Row"
            marker={(i) => <span className="w-5 shrink-0 text-right text-sm text-muted-foreground">{i + 1}.</span>}
            onChange={(next) => setConfig({ rows: next })}
          />
        </div>
        <div>
          <p className="mb-1 text-sm font-medium">Columns</p>
          <OptionList
            items={columns}
            label="Column"
            marker={() => <span className={`size-4 shrink-0 border-2 border-muted-foreground/50 ${columnShape}`} />}
            onChange={(next) => setConfig({ columns: next })}
          />
        </div>
      </div>
    );
  }

  if (question.type === "LINEAR_SCALE" || question.type === "STAR_RATING") {
    const min = typeof config.min === "number" ? config.min : 1;
    const max = typeof config.max === "number" ? config.max : 5;
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select
          aria-label="Scale starts at"
          value={min}
          onChange={(e) => setConfig({ min: Number(e.target.value) })}
          className="h-10 rounded-lg border border-input bg-background px-3"
        >
          {[0, 1].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <span className="text-muted-foreground">to</span>
        <select
          aria-label="Scale ends at"
          value={max}
          onChange={(e) => setConfig({ max: Number(e.target.value) })}
          className="h-10 rounded-lg border border-input bg-background px-3"
        >
          {Array.from({ length: 9 }, (_, i) => i + 2).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
    );
  }

  const placeholder: Partial<Record<QuestionType, string>> = {
    SHORT_ANSWER: "Short answer text",
    PARAGRAPH: "Long answer text",
    DATE: "Day, month, year",
    TIME: "Time",
    FILE_UPLOAD: "People upload one file",
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="w-full border-b border-dotted border-border pb-2 text-sm text-muted-foreground sm:w-1/2">{placeholder[question.type]}</p>
      {question.type === "SHORT_ANSWER" || question.type === "PARAGRAPH" ? (
        <details className="text-sm" open={Boolean(config.defaultValue || config.urlParam || config.format || config.maxLength)}>
          <summary className="cursor-pointer text-muted-foreground select-none hover:text-foreground">More options</summary>
          <div className="mt-3 flex flex-col gap-3">
            {question.type === "SHORT_ANSWER" ? (
              <>
                <label className="flex flex-col gap-1">
                  <span>Pre-filled answer</span>
                  <Input
                    className="sm:max-w-xs"
                    placeholder="e.g. MN1494"
                    value={(config.defaultValue as string) ?? ""}
                    onChange={(e) => setConfig({ defaultValue: e.target.value || undefined })}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span>Fill from the link (parameter name)</span>
                  <Input
                    className="sm:max-w-xs"
                    placeholder="e.g. location"
                    value={(config.urlParam as string) ?? ""}
                    onChange={(e) => setConfig({ urlParam: e.target.value.replace(/[^a-zA-Z0-9_-]/g, "") || undefined })}
                  />
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={config.format === "email"}
                    onCheckedChange={(checked) => setConfig({ format: checked === true ? "email" : undefined })}
                  />
                  Must be an email address
                </label>
              </>
            ) : null}
            <label className="flex flex-col gap-1">
              <span>Character limit</span>
              <Input
                type="number"
                min={1}
                className="w-28"
                placeholder="None"
                value={(config.maxLength as number) ?? ""}
                onChange={(e) => setConfig({ maxLength: e.target.value ? Number(e.target.value) : undefined })}
              />
            </label>
          </div>
        </details>
      ) : null}
    </div>
  );
}

function OptionList({
  items,
  label,
  marker,
  onChange,
}: {
  items: string[];
  label: string;
  marker: (index: number) => React.ReactNode;
  onChange: (items: string[]) => void;
}) {
  const refs = React.useRef<(HTMLInputElement | null)[]>([]);
  const focusIndex = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (focusIndex.current !== null) {
      refs.current[focusIndex.current]?.focus();
      refs.current[focusIndex.current]?.select();
      focusIndex.current = null;
    }
  });

  function add(after = items.length - 1) {
    const next = [...items];
    next.splice(after + 1, 0, `${label} ${items.length + 1}`);
    focusIndex.current = after + 1;
    onChange(next);
  }

  return (
    <div className="flex flex-col">
      {items.map((item, index) => (
        <div key={index} className="flex min-h-11 items-center gap-3">
          {marker(index)}
          <input
            ref={(el) => {
              refs.current[index] = el;
            }}
            value={item}
            aria-label={`${label} ${index + 1}`}
            onChange={(e) => onChange(items.map((current, i) => (i === index ? e.target.value : current)))}
            // Enter adds the next one, like typing a list.
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add(index);
              }
            }}
            className="min-w-0 flex-1 border-b border-transparent bg-transparent py-1 text-sm outline-none hover:border-border focus:border-primary"
          />
          {items.length > 1 ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onChange(items.filter((_, i) => i !== index))}
              aria-label={`Remove ${label.toLowerCase()} ${index + 1}`}
              className="text-muted-foreground"
            >
              <X />
            </Button>
          ) : null}
        </div>
      ))}
      <div className="flex min-h-11 items-center gap-3">
        {marker(items.length)}
        <button type="button" onClick={() => add()} className="text-sm text-muted-foreground hover:text-foreground hover:underline">
          Add {label.toLowerCase()}
        </button>
      </div>
    </div>
  );
}

function ShareDialog({
  open,
  onOpenChange,
  meta,
  linkParams,
  onToggle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meta: FormMeta;
  linkParams: string[];
  onToggle: (field: "isTemplate" | "publicLinkEnabled", value: boolean) => void;
}) {
  async function copyPublicLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${publicFormPath(meta.id)}`);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy — select the link and copy it manually");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Share this form</DialogTitle>
          <DialogDescription>
            {meta.status === "PUBLISHED"
              ? "Send it into a group chat from the chat's form button, or share a link anyone can open."
              : "Publish the form first — then it can be sent to a group chat or shared by link."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          {!meta.isTemplate ? (
            <div className="flex flex-col gap-3">
              <label className="flex items-start justify-between gap-4">
                <span>
                  <span className="block text-sm font-semibold">Public link</span>
                  <span className="block text-sm text-muted-foreground">
                    Anyone with the link can fill it in without signing in. Answers are anonymous.
                  </span>
                </span>
                <Switch
                  checked={meta.publicLinkEnabled}
                  onCheckedChange={(checked) => onToggle("publicLinkEnabled", checked)}
                  aria-label="Public link"
                />
              </label>
              {meta.publicLinkEnabled ? (
                <div className="flex flex-col gap-2 rounded-xl bg-muted p-3">
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={publicFormPath(meta.id)}
                      aria-label="Public link address"
                      onFocus={(e) => e.target.select()}
                      className="bg-background"
                    />
                    <Button onClick={copyPublicLink}>
                      <Copy className="size-4" /> Copy
                    </Button>
                  </div>
                  {meta.status !== "PUBLISHED" ? (
                    <p className="text-xs text-muted-foreground">The link starts working once you publish.</p>
                  ) : null}
                  {linkParams.length > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Fill answers from the link by adding {linkParams.map((p) => `?${p}=…`).join(" or ")} — for example{" "}
                      <code>?{linkParams[0]}=Chennai</code>.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <label className="flex items-start justify-between gap-4 border-t border-border pt-4">
            <span>
              <span className="flex items-center gap-2 text-sm font-semibold">
                Use as a template {meta.isTemplate ? <Badge variant="outline">Template</Badge> : null}
              </span>
              <span className="block text-sm text-muted-foreground">
                Pins it in the Templates group so all staff can start from a copy.
              </span>
            </span>
            <Switch checked={meta.isTemplate} onCheckedChange={(checked) => onToggle("isTemplate", checked)} aria-label="Use as a template" />
          </label>
        </div>
      </DialogContent>
    </Dialog>
  );
}
