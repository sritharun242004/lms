"use client";

import * as React from "react";
import { ReactLenis } from "lenis/react";

// Lenis only when the visitor hasn't asked for reduced motion — browsers
// already give a perfectly good native scroll otherwise, and we never
// want to fight that preference.
export function SmoothScroll({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = React.useState(false);

  React.useEffect(() => {
    setEnabled(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  if (!enabled) return <>{children}</>;

  return (
    <ReactLenis root options={{ lerp: 0.12, duration: 1.1, smoothWheel: true }}>
      {children}
    </ReactLenis>
  );
}
