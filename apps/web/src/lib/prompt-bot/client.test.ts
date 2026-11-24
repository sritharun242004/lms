import { describe, expect, it, vi } from "vitest";
import { call, debounce, readEnhanceStream } from "./client";

function sseResponse(chunks: string[]) {
  const stream = new ReadableStream({
    start(c) {
      for (const chunk of chunks) c.enqueue(new TextEncoder().encode(chunk));
      c.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream" } });
}

describe("readEnhanceStream", () => {
  it("joins deltas split across network chunks and returns the version", async () => {
    const onDelta = vi.fn();
    const result = await readEnhanceStream(
      sseResponse(['data: {"type":"delta","text":"## Per', 'sona"}\n\ndata: {"type":"delta","text":"\\nYou"}\n\n', 'data: {"type":"done","version":3}\n\n']),
      onDelta,
    );
    expect(onDelta.mock.calls.map((c) => c[0]).join("")).toBe("## Persona\nYou");
    expect(result).toEqual({ version: 3 });
  });

  it("surfaces server errors", async () => {
    const result = await readEnhanceStream(sseResponse(['data: {"type":"error","message":"Try again"}\n\n']), vi.fn());
    expect(result).toEqual({ error: "Try again" });
  });

  it("reads JSON error bodies from non-stream failures (429, 503)", async () => {
    const res = new Response(JSON.stringify({ success: false, error: { code: "LIMIT_REACHED", message: "You've reached today's limit." } }), {
      status: 429,
      headers: { "content-type": "application/json" },
    });
    expect(await readEnhanceStream(res, vi.fn())).toEqual({ error: "You've reached today's limit." });
  });
});

describe("debounce", () => {
  it("runs only the last call after the delay", async () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = debounce(fn, 600);
    d("a");
    d("b");
    vi.advanceTimersByTime(599);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledWith("b");
    vi.useRealTimers();
  });
});

describe("call", () => {
  it("returns the error code, message and field details of a failed request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ success: false, error: { code: "VALIDATION_ERROR", message: "Fix these", details: { files: ["bad path"] } } }), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    expect(await call("/x")).toEqual({ ok: false, code: "VALIDATION_ERROR", message: "Fix these", details: { files: ["bad path"] } });
    vi.unstubAllGlobals();
  });
});
