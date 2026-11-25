import { describe, expect, it } from "vitest";
import { JOB_LIMITS } from "./limits";

describe("plugin limits", () => {
  it("carries the plugins spec's values", () => {
    expect(JOB_LIMITS.skillsPerJob).toBe(7);
    expect(JOB_LIMITS.subSkillsMin).toBe(2);
    expect(JOB_LIMITS.subSkillsMax).toBe(6);
    expect(JOB_LIMITS.aiSubSkillsMax).toBe(4);
    expect(JOB_LIMITS.companyChars).toBe(80);
    expect(JOB_LIMITS.pluginDisplayNameChars).toBe(120);
    expect(JOB_LIMITS.skillLabelChars).toBe(60);
    expect(JOB_LIMITS.skillFocusChars).toBe(600);
    expect(JOB_LIMITS.skillStepChars).toBe(160);
    expect(JOB_LIMITS.pluginAssetBytes).toBe(25 * 1024 * 1024);
    expect(JOB_LIMITS.subSkillAssetCopyBytes).toBe(1024 * 1024);
    expect(JOB_LIMITS.pluginVersionsKept).toBe(20);
  });

  it("fits one main skill and the most sub-skills in a task", () => {
    expect(JOB_LIMITS.skillsPerJob).toBe(1 + JOB_LIMITS.subSkillsMax);
    expect(JOB_LIMITS.aiSubSkillsMax).toBeLessThanOrEqual(JOB_LIMITS.subSkillsMax);
  });
});
