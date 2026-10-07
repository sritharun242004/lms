"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Integer slider for one Scale statement. It is a native range input so
 * mouse, touch and keyboard (arrows / Home / End / PageUp / PageDown) all
 * work with correct a11y semantics. `value === null` means "not answered":
 * the thumb is shown muted at the midpoint and nothing is reported until the
 * participant actually interacts — 0 is a real answer, not "empty".
 */
export function ScaleSlider({
  id,
  label,
  min,
  max,
  leftLabel,
  rightLabel,
  value,
  onChange,
  disabled = false,
}: {
  id: string;
  label: string;
  min: number;
  max: number;
  leftLabel: string;
  rightLabel: string;
  value: number | null;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const answered = value !== null;
  const shown = answered ? value : Math.round((min + max) / 2);
  const ticks = Array.from({ length: max - min + 1 }, (_, i) => min + i);

  function commit(raw: number) {
    onChange(Math.min(max, Math.max(min, Math.round(raw))));
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-between gap-4 text-xs font-medium text-muted-foreground">
        <span>{leftLabel}</span>
        <span className="text-right">{rightLabel}</span>
      </div>
      <input
        id={id}
        type="range"
        aria-label={label}
        aria-valuetext={answered ? `${value} of ${max}` : "Not answered"}
        min={min}
        max={max}
        step={1}
        value={shown}
        disabled={disabled}
        onChange={(event) => commit(Number(event.target.value))}
        // A tap on the thumb without moving it fires no change event, so the
        // interaction itself also counts as choosing the value shown.
        onPointerUp={(event) => {
          if (!answered) commit(Number((event.target as HTMLInputElement).value));
        }}
        className={cn("h-10 w-full cursor-pointer touch-pan-y accent-primary", !answered && "opacity-50")}
      />
      <div className="flex justify-between px-1 text-[11px] tabular-nums text-muted-foreground" aria-hidden="true">
        {ticks.map((tick) => (
          <span key={tick} className={cn(answered && tick === value && "font-bold text-primary")}>
            {tick}
          </span>
        ))}
      </div>
      <p className="text-center text-sm font-semibold tabular-nums" aria-live="polite">
        {answered ? value : <span className="font-normal text-muted-foreground">Slide to answer</span>}
      </p>
    </div>
  );
}
