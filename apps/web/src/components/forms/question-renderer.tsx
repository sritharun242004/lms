"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export type QuestionLike = {
  id: string;
  type:
    | "SHORT_ANSWER"
    | "PARAGRAPH"
    | "MULTIPLE_CHOICE"
    | "CHECKBOXES"
    | "DROPDOWN"
    | "LINEAR_SCALE"
    | "STAR_RATING"
    | "DATE"
    | "TIME"
    | "FILE_UPLOAD"
    | "MULTIPLE_CHOICE_GRID"
    | "CHECKBOX_GRID";
  title: string;
  description?: string | null;
  required: boolean;
  config: unknown;
};

type Config = {
  options?: string[];
  rows?: string[];
  columns?: string[];
  min?: number;
  max?: number;
  minSelections?: number;
  maxSelections?: number;
  maxLength?: number;
};

function asConfig(config: unknown): Config {
  return typeof config === "object" && config !== null ? (config as Config) : {};
}

export function QuestionRenderer({
  question,
  value,
  onChange,
  disabled,
}: {
  question: QuestionLike;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  const config = asConfig(question.config);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
      <div>
        <p className="font-medium">
          {question.title}
          {question.required ? <span className="ml-1 text-destructive">*</span> : null}
        </p>
        {question.description ? <p className="text-sm text-muted-foreground">{question.description}</p> : null}
      </div>
      <QuestionInput question={question} config={config} value={value} onChange={onChange} disabled={disabled} />
    </div>
  );
}

function QuestionInput({
  question,
  config,
  value,
  onChange,
  disabled,
}: {
  question: QuestionLike;
  config: Config;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  switch (question.type) {
    case "SHORT_ANSWER":
      return (
        <Input
          value={(value as string) ?? ""}
          maxLength={config.maxLength}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      );
    case "PARAGRAPH":
      return (
        <Textarea
          value={(value as string) ?? ""}
          maxLength={config.maxLength}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      );
    case "MULTIPLE_CHOICE":
      return (
        <div className="flex flex-col gap-2">
          {(config.options ?? []).map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={question.id}
                checked={value === option}
                onChange={() => onChange(option)}
                disabled={disabled}
              />
              {option}
            </label>
          ))}
        </div>
      );
    case "DROPDOWN":
      return (
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        >
          <option value="" disabled>
            Choose...
          </option>
          {(config.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    case "CHECKBOXES": {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="flex flex-col gap-2">
          {(config.options ?? []).map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={selected.includes(option)}
                disabled={disabled}
                onCheckedChange={(checked) =>
                  onChange(checked ? [...selected, option] : selected.filter((item) => item !== option))
                }
              />
              {option}
            </label>
          ))}
        </div>
      );
    }
    case "LINEAR_SCALE":
    case "STAR_RATING": {
      const min = config.min ?? 1;
      const max = config.max ?? (question.type === "STAR_RATING" ? 5 : 10);
      const options = Array.from({ length: max - min + 1 }, (_, i) => min + i);
      return (
        <div className="flex flex-wrap gap-2">
          {options.map((n) => (
            <button
              key={n}
              type="button"
              disabled={disabled}
              onClick={() => onChange(n)}
              className={`size-9 rounded-full border text-sm font-medium ${
                value === n ? "border-primary bg-primary text-primary-foreground" : "border-border"
              }`}
            >
              {question.type === "STAR_RATING" ? "★".repeat(n) || n : n}
            </button>
          ))}
        </div>
      );
    }
    case "DATE":
      return <Input type="date" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} />;
    case "TIME":
      return <Input type="time" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} />;
    case "FILE_UPLOAD":
      return <FileUploadInput value={value} onChange={onChange} disabled={disabled} />;
    case "MULTIPLE_CHOICE_GRID":
    case "CHECKBOX_GRID": {
      const rows = config.rows ?? [];
      const columns = config.columns ?? [];
      const grid = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
      return (
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th />
              {columns.map((col) => (
                <th key={col} className="px-2 py-1 text-center font-normal text-muted-foreground">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row}>
                <td className="py-1 pr-2">{row}</td>
                {columns.map((col) => (
                  <td key={col} className="px-2 py-1 text-center">
                    {question.type === "MULTIPLE_CHOICE_GRID" ? (
                      <input
                        type="radio"
                        name={`${question.id}-${row}`}
                        checked={grid[row] === col}
                        disabled={disabled}
                        onChange={() => onChange({ ...grid, [row]: col })}
                      />
                    ) : (
                      <input
                        type="checkbox"
                        checked={Array.isArray(grid[row]) && (grid[row] as string[]).includes(col)}
                        disabled={disabled}
                        onChange={(e) => {
                          const current = Array.isArray(grid[row]) ? (grid[row] as string[]) : [];
                          onChange({
                            ...grid,
                            [row]: e.target.checked ? [...current, col] : current.filter((c) => c !== col),
                          });
                        }}
                      />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    default:
      return null;
  }
}

function FileUploadInput({
  value,
  onChange,
  disabled,
}: {
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  const [isUploading, setIsUploading] = React.useState(false);
  const fileValue = value as { fileId: string; fileName: string } | undefined;

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/v1/forms/answer-files", { method: "POST", body });
      const result = await response.json();
      if (result.success) onChange({ fileId: result.data.fileId, fileName: result.data.fileName });
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input type="file" onChange={handleChange} disabled={disabled || isUploading} />
      {isUploading ? <Loader2 className="size-4 animate-spin" /> : null}
      {fileValue ? <span className="text-sm text-muted-foreground">{fileValue.fileName}</span> : null}
    </div>
  );
}
