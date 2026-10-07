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

    // App Runner runs StartCommand WITHOUT a shell: "a && b" is handed to the first
    // program as plain arguments (prisma then fails with "unknown option --no-install"
    // and every deploy rolls back). The web StartCommand must be a plain program plus
    // arguments that runs the migration + server itself.
    expect(workflow).toContain("update_service lms-web \"$WEB_REPO\" 'sh /app/apps/web/start.sh' '/'");
    const webCall = workflow.split("\n").find((line) => line.trim().startsWith("update_service lms-web")) ?? "";
    expect(webCall).not.toMatch(/&&|\|\||;|\|/);
    expect(workflow).not.toContain("IMAGE_DEFAULT");
    expect(workflow).not.toMatch(/npx --no-install prisma migrate deploy &&/);
    // The explicit StartCommand path is what applies it.
    expect(workflow).toContain(".ImageRepository.ImageConfiguration.StartCommand = $command");

    // The image CMD and the App Runner StartCommand run the same script.
    const dockerfile = readFileSync(resolve(process.cwd(), "../../Dockerfile.web"), "utf8");
    expect(dockerfile).toContain('CMD ["sh", "/app/apps/web/start.sh"]');
    expect(dockerfile).toContain("WORKDIR /app/apps/web");
    expect(dockerfile).not.toMatch(/CMD \[[^\]]*&&/);
    expect(workflow).toContain("wait_until_updateable()");
    expect(workflow).toContain('wait_until_updateable "$service_name" "$arn"');
    expect(workflow).toContain("for _ in {1..180}; do");
  });
});
