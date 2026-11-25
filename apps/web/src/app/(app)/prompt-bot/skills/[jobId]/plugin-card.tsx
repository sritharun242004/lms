"use client";
import * as React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { patchJob } from "@/lib/skills/jobs/client";
import type { PluginView } from "@/lib/skills/jobs/types";
import { JOB_LIMITS } from "@/lib/skills/limits";
import { normalizeSkillName } from "@/lib/skills/names";
import { cn } from "@/lib/utils";

export const PLUGIN_ID_CHANGE_WARNING = "Claude treats a new ID as a new plugin. Remove the old one from Claude after you upload this.";
const INLINE_ERRORS = new Set(["ALREADY_GENERATING", "VALIDATION_ERROR", "DUPLICATE_NAME"]);

type Field = "pluginName" | "pluginDisplayName";
type Props = { jobId: string; plugin: PluginView; onChange(plugin: PluginView): void };

/** The plugin's display name and ID: saved on blur or Enter, reset to the default with null. */
export function PluginCard({ jobId, plugin, onChange }: Props) {
  const generating = plugin.status === "GENERATING";
  const [id, setId] = React.useState(plugin.name);
  const [label, setLabel] = React.useState(plugin.displayName);
  const [errors, setErrors] = React.useState<Partial<Record<Field, string>>>({});
  // Names that change elsewhere (the company's defaults, Redraft) replace what is shown.
  const [seen, setSeen] = React.useState({ name: plugin.name, displayName: plugin.displayName });
  if (seen.name !== plugin.name || seen.displayName !== plugin.displayName) {
    setSeen({ name: plugin.name, displayName: plugin.displayName });
    if (seen.name !== plugin.name) setId(plugin.name);
    if (seen.displayName !== plugin.displayName) setLabel(plugin.displayName);
  }
  const preview = normalizeSkillName(id, "my-plugin");
  const shipped = plugin.versions[0]?.name ?? null;
  const idChanged = plugin.latestVersion > 0 && shipped !== null && preview !== shipped;

  async function save(field: Field, value: string | null) {
    const current = field === "pluginName" ? plugin.name : plugin.displayName;
    const restore = field === "pluginName" ? setId : setLabel;
    if (value !== null && (!value.trim() || value.trim() === current)) {
      restore(current);
      return setErrors((e) => ({ ...e, [field]: undefined }));
    }
    const result = await patchJob(jobId, { [field]: value === null ? null : value.trim() });
    if (!result.ok) {
      if (INLINE_ERRORS.has(result.code)) setErrors((e) => ({ ...e, [field]: result.message }));
      else {
        toast.error(result.message);
        restore(current);
      }
      return;
    }
    setErrors((e) => ({ ...e, [field]: undefined }));
    const next = result.data.plugin;
    setId(next.name);
    setLabel(next.displayName);
    onChange(next);
  }

  return (
    <section aria-labelledby="plugin-heading" className="glass rounded-[1.75rem] p-4 sm:p-5">
      <h2 id="plugin-heading" className="text-lg font-semibold text-balance">
        Your plugin
      </h2>
      <p className="mt-0.5 text-sm text-pretty text-muted-foreground">One upload with every skill below. Name it before you generate.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <NameField
          id="plugin-display-name"
          label="Plugin name"
          value={label}
          maxLength={JOB_LIMITS.pluginDisplayNameChars}
          isDefault={plugin.displayNameIsDefault}
          disabled={generating}
          error={errors.pluginDisplayName}
          onChange={setLabel}
          onSave={() => save("pluginDisplayName", label)}
          onReset={() => save("pluginDisplayName", null)}
          hint="Follows your company and task title until you change it."
        />
        <NameField
          id="plugin-id"
          label="Plugin ID"
          mono
          value={id}
          maxLength={JOB_LIMITS.pluginDisplayNameChars}
          isDefault={plugin.nameIsDefault}
          disabled={generating}
          error={errors.pluginName}
          onChange={setId}
          onSave={() => save("pluginName", id)}
          onReset={() => save("pluginName", null)}
          hint={
            <>
              Saved as <code className="rounded bg-black/5 px-1 font-mono text-foreground dark:bg-white/10">{preview}</code>
            </>
          }
        />
      </div>
      {idChanged && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-warning/10 px-3 py-2 text-sm text-pretty">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <span>{PLUGIN_ID_CHANGE_WARNING}</span>
        </p>
      )}
      <p className="mt-3 text-sm text-muted-foreground">
        Shows in Claude as <strong className="font-semibold text-foreground">{plugin.displayName}</strong>
      </p>
    </section>
  );
}

type FieldProps = {
  id: string;
  label: string;
  value: string;
  maxLength: number;
  isDefault: boolean;
  disabled: boolean;
  error?: string;
  mono?: boolean;
  hint: React.ReactNode;
  onChange(value: string): void;
  onSave(): Promise<void>;
  onReset(): Promise<void>;
};

function NameField({ id, label, value, maxLength, isDefault, disabled, error, mono, hint, onChange, onSave, onReset }: FieldProps) {
  // Enter blurs the input, so the blur is the one save.
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-h-6 items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {isDefault ? (
          <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs text-muted-foreground dark:bg-white/10">Default</span>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            aria-label={`Reset ${label.replace(/^Plugin/, "plugin")} to default`}
            className="-my-2 min-h-11 px-2 text-xs text-muted-foreground hover:text-foreground sm:min-h-8"
            onClick={() => void onReset()}
          >
            <RotateCcw className="size-3.5" aria-hidden />
            Use default
          </Button>
        )}
      </div>
      <Input
        id={id}
        value={value}
        maxLength={maxLength}
        disabled={disabled}
        spellCheck={mono ? false : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => void onSave()}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className={cn("min-h-11 bg-white/60 dark:bg-white/5 sm:min-h-9", mono && "font-mono")}
      />
      <p id={`${id}-hint`} className="text-xs text-pretty text-muted-foreground">
        {hint}
      </p>
      {error && (
        <p id={`${id}-error`} aria-live="polite" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
