import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const scriptPath = resolve(process.cwd(), "start.sh");
const hasSh = spawnSync("sh", ["-c", "exit 0"]).status === 0;

/** Runs start.sh with a stub `npx` that logs its arguments and can fail on "prisma". */
function runWithStubbedNpx(failMigration: boolean) {
  const dir = mkdtempSync(join(tmpdir(), "start-sh-"));
  const log = join(dir, "calls.log");
  const stub = join(dir, "npx");
  writeFileSync(
    stub,
    `#!/bin/sh\necho "$@" >> "${log.replace(/\\/g, "/")}"\n` +
      (failMigration ? `case "$*" in *prisma*) exit 7;; esac\n` : "") +
      "exit 0\n",
    { mode: 0o755 }
  );
  chmodSync(stub, 0o755);
  const result = spawnSync("sh", [scriptPath.replace(/\\/g, "/")], {
    env: { ...process.env, PATH: `${dir.replace(/\\/g, "/")}:${process.env.PATH}` },
    encoding: "utf8",
  });
  const calls = (() => {
    try {
      return readFileSync(log, "utf8").trim().split("\n");
    } catch {
      return [];
    }
  })();
  return { status: result.status, calls };
}

describe("web start.sh", () => {
  const source = readFileSync(scriptPath, "utf8");

  it("is LF-only so it runs under sh in the Linux image", () => {
    expect(source).not.toContain("\r");
    expect(source.startsWith("#!/bin/sh\n")).toBe(true);
  });

  it("stops on failure and runs migrations before replacing itself with the server", () => {
    expect(source).toMatch(/^set -e$/m);
    const migrate = source.indexOf("npx --no-install prisma migrate deploy");
    const start = source.indexOf("exec npx --no-install next start");
    expect(migrate).toBeGreaterThan(-1);
    expect(start).toBeGreaterThan(migrate);
    expect(source).not.toMatch(/migrate (reset|dev)|db push/);
  });

  it.skipIf(!hasSh)("migrates first, then starts the server", () => {
    const { status, calls } = runWithStubbedNpx(false);
    expect(status).toBe(0);
    expect(calls).toEqual(["--no-install prisma migrate deploy", "--no-install next start"]);
  });

  it.skipIf(!hasSh)("never starts the server when the migration fails", () => {
    const { status, calls } = runWithStubbedNpx(true);
    expect(status).toBe(7);
    expect(calls).toEqual(["--no-install prisma migrate deploy"]);
  });
});
