"use client";

import * as React from "react";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";

// A short, snappy settle for discrete value changes (tick click, keyboard
// step, a resubmit). Within the 180–250ms range a slider transition should
// feel immediate without being abrupt.
const SLIDER_TRANSITION_MS = 200;

/**
 * Integer slider for one Scale statement. It is a native range input so
 * mouse, touch and keyboard (arrows / Home / End / PageUp / PageDown) all
 * work with correct a11y semantics. `value === null` means "not answered":
 * the thumb is shown muted at the midpoint and nothing is reported until the
 * participant actually interacts — 0 is a real answer, not "empty".
 *
 * Under the track every allowed value is its own point; pressing one chooses
 * that value through the same `onChange` as dragging. The points are a pointer
 * shortcut only: the range input stays the single control for keyboard and
 * assistive tech. `accent` colours the thumb and the chosen point.
 *
 * The native input's own thumb/track can't be animated — browsers reposition
 * them instantly on a value change regardless of CSS transitions (position is
 * computed internally, not via a transitionable box property). So the native
 * input stays the one interactive element (full-size, invisible) for mouse,
 * touch, keyboard and a11y, while a custom thumb + filled track drawn beside
 * it mirror `value` and actually animate. That overlay skips the transition
 * while a pointer drag is in progress — otherwise, at drag speed, it would
 * visibly lag behind the pointer — and whenever reduced motion is requested.
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
  accent = "var(--primary)",
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
  accent?: string;
}) {
  const answered = value !== null;
  const shown = answered ? value : Math.round((min + max) / 2);
  const ticks = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  const percent = ((shown - min) / Math.max(1, max - min)) * 100;

  const reduceMotion = usePrefersReducedMotion();
  const [dragging, setDragging] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const animated = !reduceMotion && !dragging;
  const transition = animated
    ? `left ${SLIDER_TRANSITION_MS}ms ease-out, width ${SLIDER_TRANSITION_MS}ms ease-out`
    : "none";

  function commit(raw: number) {
    onChange(Math.min(max, Math.max(min, Math.round(raw))));
  }

  function endDrag() {
    setDragging(false);
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-between gap-4 text-xs font-medium text-muted-foreground">
        <span>{leftLabel}</span>
        <span className="text-right">{rightLabel}</span>
      </div>
      <div className="relative flex h-10 w-full items-center">
        {/* Decorative: the real position lives on the native input below. */}
        <div
          className={cn("pointer-events-none relative h-1.5 w-full rounded-full bg-border", !answered && "opacity-50")}
          aria-hidden="true"
        >
          <div
            data-testid="scale-slider-fill"
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ width: `${percent}%`, backgroundColor: accent, transition }}
          />
          <div
            data-testid="scale-slider-thumb"
            className="absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background shadow-sm"
            style={{
              left: `${percent}%`,
              backgroundColor: accent,
              transition,
              boxShadow: focused ? `0 0 0 2px var(--background), 0 0 0 4px ${accent}` : undefined,
            }}
          />
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
            endDrag();
            if (!answered) commit(Number((event.target as HTMLInputElement).value));
          }}
          onPointerDown={() => setDragging(true)}
          onPointerCancel={endDrag}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            endDrag();
          }}
          style={{ accentColor: accent }}
          className="absolute inset-0 h-10 w-full cursor-pointer touch-pan-y opacity-0"
        />
      </div>
      <div className="flex justify-between text-[11px] tabular-nums" aria-hidden="true">
        {ticks.map((tick) => {
          const chosen = answered && tick === value;
          return (
            <button
              key={tick}
              type="button"
              tabIndex={-1}
              disabled={disabled}
              onClick={() => commit(tick)}
              data-testid="scale-point"
              data-selected={chosen ? "true" : undefined}
              className="group flex w-4 flex-col items-center gap-1 enabled:cursor-pointer"
            >
              <span className="flex h-2.5 items-center">
                <span
                  className={cn(
                    "block rounded-full",
                    chosen ? "size-2.5" : "size-1.5 bg-border group-enabled:group-hover:bg-muted-foreground",
                    animated && "transition-all duration-200 ease-out"
                  )}
                  style={chosen ? { backgroundColor: accent } : undefined}
                />
              </span>
              <span className={chosen ? "font-bold text-foreground" : "text-muted-foreground"}>{tick}</span>
            </button>
          );
        })}
      </div>
      <p className="text-center text-sm font-semibold tabular-nums" aria-live="polite">
        {answered ? value : <span className="font-normal text-muted-foreground">Slide to answer</span>}
      </p>
    </div>
  );
}
