/** Test-only: a complete plugin built from the fake API's drafts, the way runPluginGeneration builds one. */
import { JOB_DRAFT, subSkillDraft } from "../../../../scripts/fake-anthropic-shapes.mjs";
import { assembleJobSkill, type PlanInputFile } from "./assemble";
import { buildCommands, buildPluginManifest, manifestFile } from "./plugin";
import { pluginSkillSections, type StructureSkill } from "./plugin-assemble";
import { planPluginAssets } from "./plugin-assets";
import type { PerUseInput } from "./types";

export const FIXTURE_PLUGIN = { name: "acme-quarterly-deck", displayName: "Acme · Quarterly deck" };
export const FIXTURE_SKILLS: (StructureSkill & { fileIds: string[] })[] = [
  { name: "quarterly-deck", role: "MAIN", step: "", purpose: "Builds the quarterly board deck from the numbers.", fileIds: ["deck", "logo"] },
  { name: "deck-designer", role: "SUB", step: "Lay out the slides in the house style", purpose: "Lays out slides.", fileIds: ["logo", "deck"] },
  { name: "deck-grammar-check", role: "SUB", step: "Check the wording before handing over", purpose: "Checks wording.", fileIds: [] },
];
export const FIXTURE_PER_USE: PerUseInput[] = [{ label: "Quarter", hint: "e.g. Q3", required: true }];
export const fixtureFiles = (deckBytes: Uint8Array, logoBytes: Uint8Array): PlanInputFile[] => [
  { id: "deck", fileName: "Board deck.pptx", assetName: "board-deck.pptx", kind: "PPTX", size: deckBytes.length, analysis: "## Colours\n- #1F4E79", questionId: null },
  { id: "logo", fileName: "Logo.png", assetName: "logo.png", kind: "PNG", size: logoBytes.length, analysis: "A navy logo", questionId: null },
];

export function buildFixturePlugin(files: PlanInputFile[], version = 1) {
  const sections = pluginSkillSections(FIXTURE_PLUGIN, FIXTURE_SKILLS, FIXTURE_PER_USE.length > 0);
  const plans = planPluginAssets(FIXTURE_SKILLS, files);
  const skills = FIXTURE_SKILLS.map((s) => {
    const draft = s.role === "MAIN" ? JOB_DRAFT : subSkillDraft(s.name);
    const built = assembleJobSkill(s.name, draft, plans.get(s.name)!, { perUse: FIXTURE_PER_USE, plugin: sections.get(s.name) });
    return { name: s.name, role: s.role, label: "", purpose: s.purpose, description: draft.description, ...built };
  });
  const manifest = buildPluginManifest({
    ...FIXTURE_PLUGIN,
    version,
    mainPurpose: FIXTURE_SKILLS[0].purpose,
    subNames: FIXTURE_SKILLS.slice(1).map((s) => s.name),
    company: "Acme",
    userName: "Dana",
  });
  return { manifest, files: [manifestFile(manifest), ...buildCommands(FIXTURE_SKILLS)], skills };
}
