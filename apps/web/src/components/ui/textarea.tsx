import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-20 w-full rounded-2xl border border-transparent bg-input px-4 py-3 text-base transition-all outline-none placeholder:text-muted-foreground focus-visible:border-primary/20 focus-visible:bg-white focus-visible:shadow-[0_8px_24px_rgba(31,60,37,.08)] focus-visible:ring-3 focus-visible:ring-ring/15 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:focus-visible:bg-input",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
