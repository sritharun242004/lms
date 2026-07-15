"use client";

import { motion, useReducedMotion } from "motion/react";
import type { UserRole } from "@cms/shared";
import { getInitials, cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const ROLE_LABEL: Record<UserRole, string> = {
  ADMIN: "Admin",
  MENTOR: "Mentor",
  MENTEE: "Mentee",
};

const ROLE_BADGE: Record<UserRole, string> = {
  ADMIN: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  MENTOR: "bg-primary/10 text-primary",
  MENTEE: "bg-muted text-muted-foreground",
};

/**
 * Toast body for "<name> joined", shown when someone opens this group's chat.
 * Rendered via `toast.custom`, so this owns its own surface styling rather
 * than inheriting sonner's default toast chrome.
 */
export function JoinToast({ name, role }: { name: string; role: UserRole }) {
  // Honour the OS "reduce motion" setting: the entrance collapses to a plain
  // fade and the attention-seeking ping is dropped entirely.
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 24, scale: 0.94 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={
        reduceMotion
          ? { duration: 0.15 }
          : { type: "spring", stiffness: 170, damping: 20 }
      }
      className="flex w-full items-center gap-3 rounded-[var(--radius)] border border-border bg-popover px-4 py-3 shadow-lg"
    >
      <div className="relative shrink-0">
        <Avatar className="size-9">
          <AvatarFallback className="text-xs">{getInitials(name)}</AvatarFallback>
        </Avatar>

        {/* Presence dot with a ping ripple — the "just arrived" cue. */}
        <span className="absolute -right-0.5 -bottom-0.5 flex size-3">
          {!reduceMotion && (
            <motion.span
              className="absolute inline-flex size-full rounded-full bg-emerald-400"
              initial={{ scale: 1, opacity: 0.75 }}
              animate={{ scale: 2.4, opacity: 0 }}
              transition={{ duration: 1.2, ease: "easeOut", repeat: 2 }}
            />
          )}
          <span className="relative inline-flex size-3 rounded-full border-2 border-popover bg-emerald-500" />
        </span>
      </div>

      {/* Only the name truncates — "joined" is the point of the toast, so it
          stays pinned and legible however long the name is. */}
      <p className="flex min-w-0 flex-1 items-baseline gap-1 text-sm text-popover-foreground">
        <span className="truncate font-medium">{name}</span>
        <span className="shrink-0 text-muted-foreground">joined</span>
      </p>

      <span
        className={cn(
          "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
          ROLE_BADGE[role]
        )}
      >
        {ROLE_LABEL[role]}
      </span>
    </motion.div>
  );
}
