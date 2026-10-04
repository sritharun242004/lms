"use client";

import { motion } from "motion/react";

export function PageMotion({ children }: { children: React.ReactNode }) {
  return <div className="min-w-0 w-full flex-1 animate-fade-in">{children}</div>;
}
