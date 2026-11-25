import { describe, expect, it, vi } from "vitest";
import { readBytesWithin, readJsonWithin } from "./body";

const streamOf = (chunks: Uint8Array[], failAfter?: number) => {
  let i = 0;
  const cancel = vi.fn();
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (failAfter !== undefined && i === failAfter) return controller.error(new Error("connection reset"));
      if (i < chunks.length) controller.enqueue(chunks[i++]);
      else controller.close();
    },
    cancel,
  });
  return { stream, cancel };
};
const post = (body: BodyInit | ReadableStream<Uint8Array> | null, headers: Record<string, string> = {}) =>
  new Request("http://localhost/x", { method: "POST", body, headers, duplex: "half" } as RequestInit);
const bytes = (n: number, fill = 1) => new Uint8Array(n).fill(fill);

describe("readBytesWithin", () => {
  it("refuses a declared content-length over the cap without reading the body", async () => {
    const { stream } = streamOf([bytes(10)]);
    const req = post(stream, { "content-length": "11" });
    const read = vi.spyOn(req.body!, "getReader");
    expect(await readBytesWithin(req, 10)).toEqual({ ok: false, reason: "too_large" });
    expect(read).not.toHaveBeenCalled();
  });

  it("cancels a streamed body as soon as it goes over the cap", async () => {
    const { stream, cancel } = streamOf([bytes(6), bytes(6), bytes(6)]);
    expect(await readBytesWithin(post(stream), 10)).toEqual({ ok: false, reason: "too_large" });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("returns exactly the bytes sent when they fit the cap", async () => {
    const { stream } = streamOf([bytes(4, 7), bytes(6, 9)]);
    const result = await readBytesWithin(post(stream), 10);
    expect(result.ok).toBe(true);
    if (result.ok) expect([...result.bytes]).toEqual([7, 7, 7, 7, 9, 9, 9, 9, 9, 9]);
  });

  it("reports a body that breaks off part-way as aborted (nothing may be stored)", async () => {
    const { stream } = streamOf([bytes(4), bytes(4)], 1);
    expect(await readBytesWithin(post(stream), 100)).toEqual({ ok: false, reason: "aborted" });
  });

  it("reads a missing body as zero bytes", async () => {
    const result = await readBytesWithin(new Request("http://localhost/x", { method: "POST" }), 10);
    expect(result).toEqual({ ok: true, bytes: new Uint8Array(0) });
  });
});

describe("readJsonWithin", () => {
  it("parses JSON within the cap", async () => {
    expect(await readJsonWithin(post(JSON.stringify({ a: 1 })), 100)).toEqual({ ok: true, value: { a: 1 } });
  });

  it("refuses JSON over the cap", async () => {
    expect(await readJsonWithin(post(JSON.stringify({ a: "x".repeat(200) })), 100)).toEqual({ ok: false, reason: "too_large" });
  });

  it("reads invalid or broken-off JSON as an empty object", async () => {
    expect(await readJsonWithin(post("{not json"), 100)).toEqual({ ok: true, value: {} });
    const { stream } = streamOf([new TextEncoder().encode('{"a":')], 1);
    expect(await readJsonWithin(post(stream), 100)).toEqual({ ok: true, value: {} });
  });
});
