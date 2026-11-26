import { describe, expect, it } from "vitest";
import { ANALYSIS_STALE_MS, ANALYSIS_TIMEOUT_MS, JOB_LIMITS, SKILL_LIMITS, SUGGEST_TIMEOUT_MS, UPLOAD_ABANDONED_MS, UPLOAD_URL_TTL_SECONDS } from "./limits";

describe("job limits", () => {
  it("carries the spec's values", () => {
    expect(JOB_LIMITS.fileBytes).toBe(20 * 1024 * 1024);
    expect(JOB_LIMITS.s3FileBytes).toBe(100 * 1024 * 1024);
    expect(JOB_LIMITS.filesPerJob).toBe(10);
    expect(JOB_LIMITS.assetBytes).toBe(10 * 1024 * 1024);
    expect(JOB_LIMITS.skillAssetBytes).toBe(25 * 1024 * 1024);
    expect(JOB_LIMITS.skillsPerJob).toBe(7);
    expect(JOB_LIMITS.analysisChars).toBe(12_000);
    expect(JOB_LIMITS.factsBytes).toBe(64 * 1024);
    expect(JOB_LIMITS.versionsKept).toBe(20);
    expect(JOB_LIMITS.packZipBytes).toBe(100 * 1024 * 1024);
  });

  it("fits a 20 MB upload under Claude's 32 MB request cap after base64", () => {
    expect(Math.ceil((JOB_LIMITS.fileBytes * 4) / 3)).toBeLessThan(32 * 1024 * 1024);
  });

  it("sends a PDF to Claude only when its base64 fits the 32 MB request cap", () => {
    expect(Math.ceil((JOB_LIMITS.pdfBytesForAnalysis * 4) / 3)).toBeLessThan(32 * 1024 * 1024);
  });

  it("abandons a direct upload only after its signed link has expired", () => {
    expect(UPLOAD_ABANDONED_MS).toBeGreaterThan(UPLOAD_URL_TTL_SECONDS * 1000);
  });

  it("keeps every analysis of a full job inside one style-guide file", () => {
    expect(JOB_LIMITS.analysisChars * JOB_LIMITS.filesPerJob).toBeLessThan(SKILL_LIMITS.fileBytes);
  });

  it("keeps request-bound calls under App Runner's 120 s and stale windows above two attempts", () => {
    expect(SUGGEST_TIMEOUT_MS).toBeLessThan(120_000);
    expect(ANALYSIS_STALE_MS).toBeGreaterThan(2 * ANALYSIS_TIMEOUT_MS);
  });
});
