// Writes the Skills Builder end-to-end fixture files and prints their SHA-256.
// Usage: npx tsx scripts/make-skill-fixtures.ts <outDir>
import { writeSkillFixtures } from "../src/lib/skills/files/e2e-fixtures";

async function main() {
  const outDir = process.argv[2];
  if (!outDir) {
    console.error("Usage: npx tsx scripts/make-skill-fixtures.ts <outDir>");
    process.exit(1);
  }
  for (const file of await writeSkillFixtures(outDir)) console.log(`${file.sha256}  ${file.name}  ${file.bytes}`);
}

void main();
