"use client";

import { motion } from "motion/react";

export function PageMotion({ children }: { children: React.ReactNode }) {
  return <motion.div className="min-w-0 w-full flex-1" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}>{children}</motion.div>;
}
