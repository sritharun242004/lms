/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addJobSkill,
  analyseAgain,
  createJob,
  deleteJob,
  generateJobSkill,
  getJob,
  getJobFile,
  getVersion,
  jobDownloadUrl,
  jobUrl,
  patchJob,
  patchJobSkill,
  removeJobFile,
  removeJobSkill,
  saveAnalysis,
  saveJobAnswer,
  scoreJob,
  suggestSkills,
  uploadJobFile,
  versionDownloadUrl,
} from "./client";

type Seen = { url: string; init: RequestInit };
let seen: Seen[];

beforeEach(() => {
  seen = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      seen.push({ url, init });
      return new Response(JSON.stringify({ success: true, data: { ok: 1 } }), { status: 200 });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const last = () => seen[seen.length - 1];
const json = () => JSON.parse(last().init.body as string);
const header = (name: string) => (last().init.headers as Record<string, string>)[name];

describe("jobs client", () => {
  it("builds the job URLs", () => {
    expect(jobUrl("j1")).toBe("/api/v1/prompt-bot/skill-jobs/j1");
    expect(jobDownloadUrl("j1")).toBe("/api/v1/prompt-bot/skill-jobs/j1/download");
    expect(versionDownloadUrl("j1", "s1", 3, "upload")).toBe("/api/v1/prompt-bot/skill-jobs/j1/skills/s1/versions/3/download?format=upload");
    expect(versionDownloadUrl("j1", "s1", 3, "pack")).toBe("/api/v1/prompt-bot/skill-jobs/j1/skills/s1/versions/3/download?format=pack");
  });

  it("creates, reads, patches and deletes a job", async () => {
    await createJob({ title: "Board update", description: "Every month I…" });
    expect(last().url).toBe("/api/v1/prompt-bot/skill-jobs");
    expect(last().init.method).toBe("POST");
    expect(json()).toEqual({ title: "Board update", description: "Every month I…" });

    await getJob("j1");
    expect(last().url).toBe("/api/v1/prompt-bot/skill-jobs/j1");
    expect(last().init.method).toBeUndefined();

    await patchJob("j1", { description: "New" }, { keepalive: true });
    expect(last().init.method).toBe("PATCH");
    expect(json()).toEqual({ description: "New" });
    expect(last().init.keepalive).toBe(true);

    await deleteJob("j1");
    expect(last().init.method).toBe("DELETE");
  });

  it("saves answers and scores the job", async () => {
    await saveJobAnswer("j1", "pbq_skill_2", { answer: "Board" });
    expect(last().url).toBe("/api/v1/prompt-bot/skill-jobs/j1/answers/pbq_skill_2");
    expect(last().init.method).toBe("PUT");
    expect(json()).toEqual({ answer: "Board" });
    await scoreJob("j1", 4);
    expect(last().url).toBe("/api/v1/prompt-bot/skill-jobs/j1/score");
    expect(json()).toEqual({ revision: 4 });
  });

  it("uploads the file itself as the body, named in the query", async () => {
    const file = new File([new Uint8Array([80, 75, 3, 4])], "Q3 board deck “final”.pptx", { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
    await uploadJobFile("j1", file);
    expect(last().url).toBe(`/api/v1/prompt-bot/skill-jobs/j1/files?name=${encodeURIComponent("Q3 board deck “final”.pptx")}`);
    expect(last().init.method).toBe("POST");
    expect(last().init.body).toBe(file);
    expect(header("content-type")).toBe("application/vnd.openxmlformats-officedocument.presentationml.presentation");
  });

  it("falls back to octet-stream when the browser gives no type", async () => {
    await uploadJobFile("j1", new File([new Uint8Array([1])], "notes"));
    expect(header("content-type")).toBe("application/octet-stream");
  });

  it("reads, edits, re-analyses and removes a file", async () => {
    await getJobFile("j1", "f1");
    expect(last().url).toBe("/api/v1/prompt-bot/skill-jobs/j1/files/f1");
    await saveAnalysis("j1", "f1", "## Colours");
    expect(last().init.method).toBe("PATCH");
    expect(json()).toEqual({ analysis: "## Colours" });
    await analyseAgain("j1", "f1");
    expect(last().url).toBe("/api/v1/prompt-bot/skill-jobs/j1/files/f1/analyse");
    expect(last().init.method).toBe("POST");
    await removeJobFile("j1", "f1");
    expect(last().url).toBe("/api/v1/prompt-bot/skill-jobs/j1/files/f1");
    expect(last().init.method).toBe("DELETE");
  });

  it("suggests, adds, patches, removes and generates skills", async () => {
    await suggestSkills("j1");
    expect(last().url).toBe("/api/v1/prompt-bot/skill-jobs/j1/suggest");
    expect(last().init.method).toBe("POST");
    await addJobSkill("j1", { name: "Board update", purpose: "Writes it.", fileIds: ["f1"] });
    expect(last().url).toBe("/api/v1/prompt-bot/skill-jobs/j1/skills");
    expect(json()).toEqual({ name: "Board update", purpose: "Writes it.", fileIds: ["f1"] });
    await patchJobSkill("j1", "s1", { fileIds: [] });
    expect(last().url).toBe("/api/v1/prompt-bot/skill-jobs/j1/skills/s1");
    expect(last().init.method).toBe("PATCH");
    expect(json()).toEqual({ fileIds: [] });
    await removeJobSkill("j1", "s1");
    expect(last().init.method).toBe("DELETE");
    await generateJobSkill("j1", "s1");
    expect(last().url).toBe("/api/v1/prompt-bot/skill-jobs/j1/skills/s1/generate");
    expect(last().init.method).toBe("POST");
  });

  it("reads a version by number or as latest", async () => {
    await getVersion("j1", "s1", 2);
    expect(last().url).toBe("/api/v1/prompt-bot/skill-jobs/j1/skills/s1/versions/2");
    await getVersion("j1", "s1", "latest");
    expect(last().url).toBe("/api/v1/prompt-bot/skill-jobs/j1/skills/s1/versions/latest");
  });
});
