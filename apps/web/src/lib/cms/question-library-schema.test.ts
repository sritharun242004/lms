import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const schemaPath = resolve(process.cwd(), "prisma/schema.prisma");
const migrationPath = resolve(
  process.cwd(),
  "prisma/migrations/20261007120000_add_question_library_type/migration.sql"
);
const deployWorkflowPath = resolve(process.cwd(), "../../.github/workflows/deploy.yml");

describe("question library discriminator migration", () => {
  it("defines all repository types and defaults existing library rows to MULTIPLE_CHOICE", () => {
    const schema = readFileSync(schemaPath, "utf8");

    expect(schema).toMatch(/enum QuestionLibraryType\s*{[^}]*MULTIPLE_CHOICE[^}]*WORD_CLOUD[^}]*OPEN_ENDED[^}]*}/);
    expect(schema).toMatch(/model QuestionLibraryItem\s*{[^}]*type\s+QuestionLibraryType\s+@default\(MULTIPLE_CHOICE\)/);
  });

  it("uses a non-destructive SQL default so pre-existing rows are backfilled", () => {
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) return;

    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toContain("CREATE TYPE \"QuestionLibraryType\" AS ENUM ('MULTIPLE_CHOICE', 'WORD_CLOUD', 'OPEN_ENDED')");
    expect(migration).toContain("ADD COLUMN \"type\" \"QuestionLibraryType\" NOT NULL DEFAULT 'MULTIPLE_CHOICE'");
    expect(migration).not.toMatch(/DROP TABLE|TRUNCATE|DELETE FROM/i);
  });

  it("deploys pending migrations before starting the production web server", () => {
    const workflow = readFileSync(deployWorkflowPath, "utf8");

    // App Runner runs StartCommand without a shell, so a "migrate && start" override is
    // passed to the first program as arguments and the container never starts. The web
    // service must use the image CMD, which does run migrations before the server.
    expect(workflow).toContain("update_service lms-web \"$WEB_REPO\" 'IMAGE_DEFAULT' '/'");
    expect(workflow).toContain('if [ "$start_command" = "IMAGE_DEFAULT" ]; then');
    expect(workflow).toContain("del(.ImageRepository.ImageConfiguration.StartCommand)");
    expect(workflow).not.toMatch(/update_service lms-web[^\n]*&&/);
    expect(workflow).not.toMatch(/npx --no-install prisma migrate deploy &&/);
    // Explicit overrides for other services keep working.
    expect(workflow).toContain(".ImageRepository.ImageConfiguration.StartCommand = $command");
    const dockerfile = readFileSync(resolve(process.cwd(), "../../Dockerfile.web"), "utf8");
    expect(dockerfile).toContain(
      'CMD ["sh", "-c", "npx --no-install prisma migrate deploy && npx --no-install next start"]'
    );
    expect(workflow).toContain("wait_until_updateable()");
    expect(workflow).toContain('wait_until_updateable "$service_name" "$arn"');
    expect(workflow).toContain("for _ in {1..180}; do");
  });
});
