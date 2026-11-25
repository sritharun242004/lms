"use client";
import * as React from "react";
import { SkillFilesView } from "@/components/prompt-bot/skills/skill-files-view";
import type { PluginVersionDetail } from "@/lib/skills/jobs/types";
import type { SkillFile } from "@/lib/skills/types";
import { cn } from "@/lib/utils";

const PLUGIN_TAB = "plugin.json and commands";
type Tab = { key: string; label: string; main: boolean; files: SkillFile[]; assets: PluginVersionDetail["skills"][number]["assets"] };

function tabsFor(detail: PluginVersionDetail): Tab[] {
  const skills = [...detail.skills].sort((a, b) => Number(b.role === "MAIN") - Number(a.role === "MAIN"));
  const manifest: SkillFile = { path: ".claude-plugin/plugin.json", content: `${JSON.stringify(detail.manifest, null, 2)}\n` };
  return [
    ...skills.map((s) => ({ key: `skill:${s.name}`, label: s.name, main: s.role === "MAIN", files: s.files, assets: s.assets })),
    { key: "plugin", label: PLUGIN_TAB, main: false, files: [manifest, ...detail.commands], assets: [] },
  ];
}

/** One version's files: a tab per skill (main first), then the plugin's own plugin.json and commands. */
export function PluginFilesTabs({ detail }: { detail: PluginVersionDetail }) {
  const tabs = React.useMemo(() => tabsFor(detail), [detail]);
  const [selected, setSelected] = React.useState(tabs[0].key);
  const current = tabs.find((t) => t.key === selected) ?? tabs[0];
  const refs = React.useRef(new Map<string, HTMLButtonElement>());
  const base = `plugin-v${detail.version}`;

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    const last = tabs.length - 1;
    const next = { ArrowRight: index === last ? 0 : index + 1, ArrowLeft: index === 0 ? last : index - 1, Home: 0, End: last }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setSelected(tabs[next].key);
    refs.current.get(tabs[next].key)?.focus();
  }

  return (
    <div>
      <div role="tablist" aria-label={`Files in v${detail.version}`} className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {tabs.map((t, i) => {
          const on = t.key === current.key;
          return (
            <button
              key={t.key}
              ref={(el) => {
                if (el) refs.current.set(t.key, el);
                else refs.current.delete(t.key);
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${i}`}
              aria-selected={on}
              aria-controls={`${base}-panel`}
              tabIndex={on ? 0 : -1}
              onClick={() => setSelected(t.key)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn(
                "flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 sm:min-h-9",
                t.key === "plugin" ? "font-sans" : "font-mono",
                on ? "bg-primary/10 text-primary ring-1 ring-primary/30" : "text-muted-foreground hover:bg-white/60 hover:text-foreground dark:hover:bg-white/10",
              )}
            >
              {t.label}
              {t.main && <span className="rounded-full bg-primary px-1.5 font-sans text-[0.6875rem] font-medium text-primary-foreground">Main</span>}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-tab-${tabs.indexOf(current)}`} className="mt-3">
        <SkillFilesView key={current.key} files={current.files} assets={current.assets} />
      </div>
    </div>
  );
}
