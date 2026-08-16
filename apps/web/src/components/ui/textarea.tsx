import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-xl border border-white/12 bg-white/[.035] px-3.5 py-3 text-base backdrop-blur-xl transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-[#77ff61]/50 focus-visible:ring-3 focus-visible:ring-[#77ff61]/15 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
