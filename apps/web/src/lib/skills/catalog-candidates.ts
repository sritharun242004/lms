/**
 * Public skills the split step may recommend (spec, 2026-11-24). Licenses are NOT
 * recorded here: scripts/verify-catalog-licenses.ts reads each LICENSE file and
 * writes catalog-licenses.ts. Relative imports only: scripts load this through tsx.
 */
export type CatalogCandidate = {
  slug: string;
  name: string;
  description: string;
  sourceUrl: string;
  /** GitHub owner/repo and the skill's folder inside it ("" for the repository root). */
  repo: string;
  dir: string;
  installNotes: string;
  tags: string[];
};

const ANTHROPIC_NOTES =
  "Download the skill folder from the source repository and install it the same way as the skills in this pack (see README.md). Read its LICENSE file before sharing it.";

const anthropic = (slug: string, name: string, description: string, tags: string[]): CatalogCandidate => ({
  slug,
  name,
  description,
  sourceUrl: `https://github.com/anthropics/skills/tree/main/skills/${slug}`,
  repo: "anthropics/skills",
  dir: `skills/${slug}`,
  installNotes: ANTHROPIC_NOTES,
  tags,
});

export const CATALOG_CANDIDATES: CatalogCandidate[] = [
  {
    slug: "impeccable",
    name: "Impeccable",
    description: "Design, critique, audit and polish user interfaces: layout, typography, colour, accessibility and UX copy for websites, apps and dashboards.",
    sourceUrl: "https://github.com/pbakaus/impeccable",
    repo: "pbakaus/impeccable",
    dir: "",
    installNotes: "Follow the installation steps in the source repository's README.",
    tags: ["design", "ui", "ux"],
  },
  anthropic("pptx", "PowerPoint presentations", "Create and edit PowerPoint presentations (.pptx): decks, slides, layouts and speaker notes.", ["presentations", "documents"]),
  anthropic("docx", "Word documents", "Create and edit Word documents (.docx), including formatting, tables, comments and tracked changes.", ["documents", "writing"]),
  anthropic("xlsx", "Excel spreadsheets", "Create, analyse and edit Excel spreadsheets (.xlsx) with formulas, formatting and charts.", ["spreadsheets", "data"]),
  anthropic("pdf", "PDF files", "Read, extract, fill, merge, split and create PDF files.", ["documents", "pdf"]),
  anthropic("frontend-design", "Frontend design", "Build distinctive, production-grade web interfaces with a clear visual direction instead of generic layouts.", ["design", "frontend"]),
  anthropic("skill-creator", "Skill creator", "Create, refine and test skills, including writing descriptions that trigger reliably and evaluating them.", ["skills", "meta"]),
];
