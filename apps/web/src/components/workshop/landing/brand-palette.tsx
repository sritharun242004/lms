"use client";

import * as React from "react";
import { DEFAULT_PALETTE } from "@/lib/theme/palettes";

// The landing page always wears the XI brand blue. A palette picked inside
// the app survives client-side navigation on <html>, so pin the default
// while this page is mounted and hand the visitor's choice back on leave.
export function BrandPalette() {
  React.useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute("data-palette");
    root.setAttribute("data-palette", DEFAULT_PALETTE);
    return () => {
      if (previous) root.setAttribute("data-palette", previous);
    };
  }, []);
  return null;
}
