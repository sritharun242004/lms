/** Test fixtures: JobViews for each plugin state the Skills step shows (spec 2026-11-25 plugins, Testing). */
import type { JobSkillView, JobView, PluginVersionDetail, PluginView } from "@/lib/skills/jobs/types";

export const PLUGIN_NOW = "2026-11-25T10:00:00.000Z";

export const pluginView = (over: Partial<PluginView> = {}): PluginView => ({
  name: "acme-quarterly-deck",
  nameIsDefault: true,
  displayName: "Acme · Quarterly deck",
  displayNameIsDefault: true,
  status: "DRAFT",
  validationErrors: [],
  latestVersion: 0,
  versions: [],
  ...over,
});

export const jobSkill = (over: Partial<JobSkillView> = {}): JobSkillView => ({
  id: "s-main",
  order: 0,
  role: "SUB",
  name: "skill",
  label: "",
  purpose: "Writes it.",
  focus: "",
  step: "",
  fileIds: [],
  status: "DRAFT",
  validationErrors: [],
  latestVersion: 0,
  versions: [],
  ...over,
});

export const MAIN = jobSkill({ id: "s-main", order: 0, role: "MAIN", name: "quarterly-deck", label: "Quarterly deck", purpose: "Builds the whole quarterly deck." });
export const SUBS: JobSkillView[] = [
  jobSkill({ id: "s-1", order: 1, name: "deck-analyzer", label: "Analyzer", purpose: "Reads the source files.", step: "Analyse the source files", focus: "Pulls the figures; leaves layout to the main skill." }),
  jobSkill({ id: "s-2", order: 2, name: "deck-designer", label: "Designer", purpose: "Lays out the slides.", step: "Lay out the slides in the house style" }),
  jobSkill({ id: "s-3", order: 3, name: "deck-grammar-check", label: "Grammar check", purpose: "Checks the wording.", step: "Check the wording before handing over" }),
];

export const jobView = (over: Partial<JobView> = {}): JobView => ({
  id: "j1",
  title: "Quarterly deck",
  description: "Every quarter…",
  scoreRevision: 0,
  updatedAt: PLUGIN_NOW,
  suggestedAt: null,
  questionsGeneratedAt: null,
  outputType: null,
  questions: [],
  matrix: { id: "m", name: "Task questions", questions: [] },
  answers: [],
  files: [],
  company: "Acme",
  plugin: pluginView(),
  skills: [],
  ...over,
});

const VERSIONS = [
  { version: 2, name: "acme-quarterly-deck", displayName: "Acme · Quarterly deck", createdAt: "2026-11-25T14:02:00.000Z", skills: 4, assets: 1 },
  { version: 1, name: "acme-quarterly-deck", displayName: "Acme · Quarterly deck", createdAt: "2026-11-25T11:30:00.000Z", skills: 4, assets: 0 },
];

/** Every state in the plan's fixture list. */
export const FIXTURES = {
  noSkills: jobView(),
  draft: jobView({ suggestedAt: PLUGIN_NOW, skills: [MAIN, ...SUBS] }),
  generating: jobView({ suggestedAt: PLUGIN_NOW, skills: [MAIN, ...SUBS], plugin: pluginView({ status: "GENERATING" }) }),
  readyV2: jobView({ suggestedAt: PLUGIN_NOW, skills: [MAIN, ...SUBS], plugin: pluginView({ status: "READY", latestVersion: 2, versions: VERSIONS }) }),
  failed: jobView({
    suggestedAt: PLUGIN_NOW,
    skills: [MAIN, ...SUBS],
    plugin: pluginView({ status: "FAILED", validationErrors: ["deck-designer: description is too long", "deck-grammar-check: body is empty"] }),
  }),
  migrated: jobView({
    company: "",
    plugin: pluginView({ name: "board-update", displayName: "Board update" }),
    skills: [
      jobSkill({ id: "s-old", role: "MAIN", name: "board-update", status: "READY", latestVersion: 2, versions: [
        { version: 2, name: "board-update", createdAt: "2026-11-20T09:00:00.000Z", assets: 0 },
        { version: 1, name: "board-update", createdAt: "2026-11-19T09:00:00.000Z", assets: 0 },
      ] }),
      jobSkill({ id: "s-old-2", order: 1, name: "board-checker", purpose: "Checks it." }),
    ],
  }),
};

export const pluginVersionDetail = (version = 2): PluginVersionDetail => ({
  version,
  name: "acme-quarterly-deck",
  displayName: "Acme · Quarterly deck",
  createdAt: "2026-11-25T14:02:00.000Z",
  manifest: { name: "acme-quarterly-deck", displayName: "Acme · Quarterly deck", version: `1.${version - 1}.0`, description: "Builds the deck.", author: { name: "Acme" } },
  commands: [
    { path: "commands/quarterly-deck.md", content: "---\ndescription: Builds the deck.\n---\nRun the `quarterly-deck` skill" },
    { path: "commands/deck-designer.md", content: "---\ndescription: Lays out.\n---\nUse the `deck-designer` skill" },
  ],
  skills: [
    { name: "quarterly-deck", role: "MAIN", label: "Quarterly deck", purpose: "Builds the whole deck.", description: "Builds the deck.",
      files: [{ path: "SKILL.md", content: "---\nname: quarterly-deck\n---\n## How this skill works" }],
      assets: [{ fileId: "f1", path: "assets/template.pptx", fileName: "template.pptx", bytes: 2048 }] },
    { name: "deck-designer", role: "SUB", label: "Designer", purpose: "Lays out the slides.", description: "Lays out.",
      files: [{ path: "SKILL.md", content: "---\nname: deck-designer\n---\n> Part of the plugin" }], assets: [] },
  ],
});
