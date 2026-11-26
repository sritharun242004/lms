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
  format?: "email";
};

function asConfig(config: unknown): Config {
  return typeof config === "object" && config !== null ? (config as Config) : {};
}

export function QuestionRenderer({
  question,
  value,
  onChange,
  disabled,
  publicFormId,
}: {
  question: QuestionLike;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  /** Set only on the public link (/f/[id]): a FILE_UPLOAD question then
   * uploads through that form's unauthenticated upload routes instead of
   * the signed-in staff/participant ones. */
  publicFormId?: string;
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
      <QuestionInput question={question} config={config} value={value} onChange={onChange} disabled={disabled} publicFormId={publicFormId} />
    </div>
  );
}

function QuestionInput({
  question,
  config,
  value,
  onChange,
  disabled,
  publicFormId,
}: {
  question: QuestionLike;
  config: Config;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  publicFormId?: string;
}) {
  switch (question.type) {
    case "SHORT_ANSWER":
      return (
        <Input
          type={config.format === "email" ? "email" : "text"}
          autoComplete={config.format === "email" ? "email" : undefined}
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
              aria-pressed={value === n}
              aria-label={question.type === "STAR_RATING" ? `${n} ${n === 1 ? "star" : "stars"}` : String(n)}
              className={`inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-full border px-3 text-sm font-medium ${
                value === n ? "border-primary bg-primary text-primary-foreground" : "border-border"
              }`}
            >
              {/* "★★★★★" outgrew a fixed circle; a number and one star always fits. */}
              {n}
              {question.type === "STAR_RATING" ? <span aria-hidden="true">★</span> : null}
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
      return (
        <FileUploadInput
          value={value}
          onChange={onChange}
          disabled={disabled}
          questionId={question.id}
          publicFormId={publicFormId}
        />
      );
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

type UploadTarget =
  | { mode: "s3"; fileId: string; uploadUrl: string; headers: Record<string, string>; maxBytes: number }
  | { mode: "direct"; maxBytes: number };

function formatSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${Math.round(bytes / (1024 * 1024))} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// XHR rather than fetch: it is the only browser API that reports upload
// progress, and a 100 MB file needs a progress bar.
function putWithProgress(
  url: string,
  method: "PUT" | "POST",
  body: Blob | FormData,
  headers: Record<string, string>,
  onProgress: (fraction: number) => void
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText });
    xhr.onerror = () => reject(new Error("The upload was interrupted. Check your connection and try again."));
    xhr.send(body);
  });
}

function FileUploadInput({
  value,
  onChange,
  disabled,
  questionId,
  publicFormId,
}: {
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  questionId: string;
  publicFormId?: string;
}) {
  const [progress, setProgress] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const fileValue = value as { fileId: string; fileName: string; size?: number } | undefined;
  const isUploading = progress !== null;
  const [maxBytes, setMaxBytes] = React.useState<number | null>(null);

  const initUrl = publicFormId
    ? `/api/v1/public/forms/${publicFormId}/answer-files/upload-url`
    : "/api/v1/forms/answer-files/upload-url";
  const directUrl = publicFormId
    ? `/api/v1/public/forms/${publicFormId}/answer-files`
    : "/api/v1/forms/answer-files";

  React.useEffect(() => {
    if (disabled) return;
    let cancelled = false;
    fetch(initUrl)
      .then((response) => response.json())
      .then((result) => {
        if (!cancelled && result.success) setMaxBytes(result.data.maxBytes);
      })
      // Only the hint depends on this; the server still enforces the limit.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [disabled, initUrl]);

  async function upload(file: File) {
    setError(null);
    if (maxBytes !== null && file.size > maxBytes) {
      setError(`That file is ${formatSize(file.size)}. The limit is ${formatSize(maxBytes)}.`);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setProgress(0);
    try {
      const response = await fetch(initUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, mimeType: file.type, size: file.size, questionId }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error?.message || "Couldn't start the upload");
      const target = result.data as UploadTarget;

      if (target.mode === "s3") {
        const sent = await putWithProgress(target.uploadUrl, "PUT", file, target.headers, setProgress);
        if (sent.status < 200 || sent.status >= 300) throw new Error("The upload didn't finish. Please try again.");
        onChange({ fileId: target.fileId, fileName: file.name, size: file.size });
      } else {
        const body = new FormData();
        body.append("file", file);
        body.append("questionId", questionId);
        const sent = await putWithProgress(directUrl, "POST", body, {}, setProgress);
        const stored = JSON.parse(sent.text || "{}");
        if (sent.status < 200 || sent.status >= 300 || !stored.success) {
          throw new Error(stored.error?.message || "The upload didn't finish. Please try again.");
        }
        onChange({ fileId: stored.data.fileId, fileName: stored.data.fileName, size: file.size });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "The upload didn't finish. Please try again.");
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {fileValue && !isUploading ? (
        <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate font-medium">{fileValue.fileName}</span>
          {fileValue.size ? <span className="shrink-0 text-muted-foreground">{formatSize(fileValue.size)}</span> : null}
          {!disabled ? (
            <button type="button" className="shrink-0 text-muted-foreground hover:text-foreground hover:underline" onClick={() => onChange(undefined)}>
              Remove
            </button>
          ) : null}
        </div>
      ) : null}

      {!fileValue || isUploading ? (
        <label className={`flex flex-col gap-1 ${disabled || isUploading ? "" : "cursor-pointer"}`}>
          <input
            ref={inputRef}
            type="file"
            className="text-sm file:mr-3 file:rounded-lg file:border file:border-border file:bg-background file:px-3 file:py-2 file:text-sm file:font-medium"
            disabled={disabled || isUploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <span className="text-xs text-muted-foreground">
            One file{maxBytes !== null ? `, up to ${formatSize(maxBytes)}` : ""}.
          </span>
        </label>
      ) : null}

      {isUploading ? (
        <div className="flex items-center gap-3" role="status" aria-live="polite">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
            {progress < 1 ? `${Math.round(progress * 100)}%` : <Loader2 className="ml-auto size-4 animate-spin" />}
          </span>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
