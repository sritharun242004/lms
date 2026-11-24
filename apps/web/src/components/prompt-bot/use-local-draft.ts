"use client";
import * as React from "react";

/** Storage can be blocked (private windows, disabled site data); a draft is a convenience, so failures are ignored. */
function read(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function write(key: string, value: string) {
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    // Ignored: the text stays in the field for this visit.
  }
}

/**
 * Unsubmitted form text that survives leaving the page (switching tabs in the app, reloading).
 * Saved on every change; call `clear` once the text has been submitted. The saved value is read
 * after mount so the server render and the first client render match.
 */
export function useLocalDraft(key: string) {
  const [value, setValue] = React.useState("");
  React.useEffect(() => {
    const saved = read(key);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring browser-only state after hydration
    if (saved) setValue(saved);
  }, [key]);
  const update = React.useCallback(
    (next: string) => {
      setValue(next);
      write(key, next);
    },
    [key],
  );
  const clear = React.useCallback(() => write(key, ""), [key]);
  return [value, update, clear] as const;
}
