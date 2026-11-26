/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { uploadJobFile } from "./client";

const BASE = "/api/v1/prompt-bot/skill-jobs/j1";
type Seen = { url: string; init: RequestInit };
let seen: Seen[];
let replies: unknown[];

/** A stand-in XHR: the test decides how each PUT ends (progress, then load / error / abort). */
class FakeXhr {
  static last: FakeXhr | null = null;
  method = "";
  url = "";
  headers: Record<string, string> = {};
  body: unknown = null;
  status = 0;
  upload: {
    onprogress:
      | ((e: {
          lengthComputable: boolean;
          loaded: number;
          total: number;
        }) => void)
      | null;
  } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  constructor() {
    FakeXhr.last = this;
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: unknown) {
    this.body = body;
    queueMicrotask(() => putPlan(this));
  }
  abort() {
    this.onabort?.();
  }
}
let putPlan: (xhr: FakeXhr) => void;

const s3Target = {
  mode: "s3",
  fileId: "u1",
  uploadUrl: "https://bucket.s3/put?sig",
  headers: { "Content-Type": "application/pdf" },
  maxBytes: 100 * 1024 * 1024,
};
const view = { id: "u1", fileName: "big.pdf" };
const ok = (data: unknown) => ({ success: true, data });

beforeEach(() => {
  seen = [];
  replies = [];
  FakeXhr.last = null;
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      seen.push({ url, init });
      const reply = replies.shift() ?? ok({});
      return new Response(JSON.stringify(reply), {
        status: (reply as { success?: boolean }).success ? 200 : 400,
      });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const file = () =>
  new File([new Uint8Array(10)], "big.pdf", { type: "application/pdf" });

describe("uploadJobFile", () => {
  it("declares the file, PUTs it to S3 with progress, then completes it", async () => {
    replies = [ok(s3Target), ok(view)];
    putPlan = (xhr) => {
      xhr.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 });
      xhr.status = 200;
      xhr.onload?.();
    };
    const progress: number[] = [];
    const f = file();
    const result = await uploadJobFile("j1", f, {
      questionId: "q1",
      onProgress: (p) => progress.push(p),
    });

    expect(result).toEqual({ ok: true, data: view });
    expect(seen[0].url).toBe(`${BASE}/files/upload-url`);
    expect(JSON.parse(seen[0].init.body as string)).toEqual({
      name: "big.pdf",
      size: 10,
      questionId: "q1",
    });
    expect(FakeXhr.last).toMatchObject({
      method: "PUT",
      url: s3Target.uploadUrl,
      headers: s3Target.headers,
      body: f,
    });
    expect(progress).toEqual([0.5, 1]);
    expect(seen[1].url).toBe(`${BASE}/files/u1/complete`);
    expect(seen[1].init.method).toBe("POST");
  });

  it("posts the file to this server when there is no bucket", async () => {
    replies = [ok({ mode: "direct", maxBytes: 20 * 1024 * 1024 }), ok(view)];
    const f = file();
    await uploadJobFile("j1", f);
    expect(FakeXhr.last).toBeNull();
    expect(seen[1].url).toBe(`${BASE}/files?name=big.pdf`);
    expect(seen[1].init.body).toBe(f);
  });

  it("stops at a refused declaration (too large) without sending bytes", async () => {
    replies = [
      {
        success: false,
        error: {
          code: "FILE_TOO_LARGE",
          message: "Files can be up to 100 MB.",
        },
      },
    ];
    const result = await uploadJobFile("j1", file());
    expect(result).toMatchObject({
      ok: false,
      code: "FILE_TOO_LARGE",
      message: "Files can be up to 100 MB.",
    });
    expect(FakeXhr.last).toBeNull();
    expect(seen).toHaveLength(1);
  });

  it("reports a dropped connection as retryable and never completes", async () => {
    replies = [ok(s3Target)];
    putPlan = (xhr) => xhr.onerror?.();
    const result = await uploadJobFile("j1", file());
    expect(result).toMatchObject({ ok: false, code: "NETWORK_ERROR" });
    expect(seen).toHaveLength(1);
  });

  it("reports a refused PUT (an expired link) as UPLOAD_FAILED", async () => {
    replies = [ok(s3Target)];
    putPlan = (xhr) => {
      xhr.status = 403;
      xhr.onload?.();
    };
    expect(await uploadJobFile("j1", file())).toMatchObject({
      ok: false,
      code: "UPLOAD_FAILED",
    });
  });

  it("cancels a running PUT through the signal", async () => {
    replies = [ok(s3Target)];
    const controller = new AbortController();
    putPlan = () => controller.abort();
    const result = await uploadJobFile("j1", file(), {
      signal: controller.signal,
    });
    expect(result).toMatchObject({ ok: false, code: "UPLOAD_CANCELLED" });
    expect(seen).toHaveLength(1);
  });
});
