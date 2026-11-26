/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addQuestion, deleteQuestion, enhanceTask, generateQuestions, patchQuestion, postJobFile } from "./client";

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

const BASE = "/api/v1/prompt-bot/skill-jobs/j1";
const last = () => seen[seen.length - 1];

describe("task client calls", () => {
  it("enhances the text in the box, saved or not", async () => {
    expect(await enhanceTask("j1", "Every week I build a deck")).toEqual({ ok: true, data: { ok: 1 } });
    expect(last().url).toBe(`${BASE}/enhance`);
    expect(last().init.method).toBe("POST");
    expect(JSON.parse(String(last().init.body))).toEqual({ description: "Every week I build a deck" });
  });

  it("writes questions with an empty body", async () => {
    await generateQuestions("j1");
    expect(last().url).toBe(`${BASE}/questions/generate`);
    expect(last().init.method).toBe("POST");
    expect(last().init.body).toBeUndefined();
  });

  it("adds, patches and deletes a question", async () => {
    await addQuestion("j1", { text: "Client name", kind: "PER_USE", required: true });
    expect(last().url).toBe(`${BASE}/questions`);
    expect(last().init.method).toBe("POST");
    expect(JSON.parse(String(last().init.body))).toEqual({ text: "Client name", kind: "PER_USE", required: true });

    await patchQuestion("j1", "q 1", { kind: "FIXED" });
    expect(last().url).toBe(`${BASE}/questions/q%201`);
    expect(last().init.method).toBe("PATCH");
    expect(JSON.parse(String(last().init.body))).toEqual({ kind: "FIXED" });

    await deleteQuestion("j1", "q1");
    expect(last().url).toBe(`${BASE}/questions/q1`);
    expect(last().init.method).toBe("DELETE");
  });

  it("sends questionId with an upload only when given", async () => {
    const file = new File(["x"], "Brand kit.pdf", { type: "application/pdf" });
    await postJobFile("j1", file);
    expect(last().url).toBe(`${BASE}/files?name=Brand%20kit.pdf`);
    await postJobFile("j1", file, "q&1");
    expect(last().url).toBe(`${BASE}/files?name=Brand%20kit.pdf&questionId=q%261`);
    expect(last().init.body).toBe(file);
  });
});
