"use client";

import * as React from "react";
import { Check, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PALETTES, type PaletteKey } from "@/lib/theme/palettes";

export function PaletteSwitcher({ initialPalette }: { initialPalette: PaletteKey }) {
  const [palette, setPalette] = React.useState<PaletteKey>(initialPalette);

  function choose(next: PaletteKey) {
    setPalette(next);
    document.documentElement.setAttribute("data-palette", next);
    try {
      localStorage.setItem("xi-palette", next);
    } catch {
      // ignore
    }
    void fetch("/api/v1/profile/theme", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ themePreference: next }),
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Choose colour theme">
          <Palette className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {PALETTES.map((p) => (
          <DropdownMenuItem key={p.key} onSelect={() => choose(p.key)}>
            {p.key === palette ? <Check className="size-4" /> : <span className="size-4" />}
            {p.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
