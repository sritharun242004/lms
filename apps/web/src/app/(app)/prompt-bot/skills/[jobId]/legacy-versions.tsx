"use client";
import type { JobSkillView } from "@/lib/skills/jobs/types";
import { VersionPreview } from "./version-preview";

/** Skills generated one at a time before plugins: their versions stay read-only and downloadable. */
export const hasLegacyVersions = (skills: JobSkillView[]) => skills.some((s) => s.latestVersion > 0 && s.versions.length > 0);

/** "Earlier single-skill versions": today's per-skill version list and downloads, for migrated tasks only. */
export function LegacyVersions({ jobId, skills }: { jobId: string; skills: JobSkillView[] }) {
  const legacy = skills.filter((s) => s.latestVersion > 0 && s.versions.length > 0);
  return (
    <section aria-labelledby="legacy-versions-heading" className="glass rounded-[1.75rem] p-4 sm:p-5">
      <h3 id="legacy-versions-heading" className="text-base font-semibold">
        Earlier single-skill versions
      </h3>
      <p className="mt-0.5 text-sm text-pretty text-muted-foreground">
        From before this task became a plugin. They still download as single skills and don&apos;t change.
      </p>
      <ul className="mt-2 flex flex-col">
        {legacy.map((s) => (
          <li key={s.id} className="pt-3">
            <h4 className="font-mono text-sm font-semibold">{s.name}</h4>
            <VersionPreview jobId={jobId} skill={s} />
          </li>
        ))}
      </ul>
    </section>
  );
}
