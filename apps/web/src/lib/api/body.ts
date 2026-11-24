/** Request bodies read with a byte cap, so an oversized request is refused before it is buffered and parsed. */
export type BoundedBytes = { ok: true; bytes: Uint8Array } | { ok: false; reason: "too_large" | "aborted" };
export type BoundedJson = { ok: true; value: unknown } | { ok: false; reason: "too_large" };

/**
 * Rejects a declared content-length over `maxBytes` without reading, otherwise streams at most `maxBytes`
 * and cancels the stream as soon as it goes over. A stream that errors part-way (the client went away)
 * is "aborted": the caller must not store anything from it.
 */
export async function readBytesWithin(req: Request, maxBytes: number): Promise<BoundedBytes> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, reason: "too_large" };
  if (!req.body) return { ok: true, bytes: new Uint8Array(0) };
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "aborted" };
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes };
}

/**
 * A JSON body within `maxBytes`. A body that is not JSON, or that broke off part-way, reads as `{}`,
 * like `req.json().catch(() => ({}))`, so schema validation reports it.
 */
export async function readJsonWithin(req: Request, maxBytes: number): Promise<BoundedJson> {
  const body = await readBytesWithin(req, maxBytes);
  if (!body.ok) return body.reason === "too_large" ? { ok: false, reason: "too_large" } : { ok: true, value: {} };
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(body.bytes)) };
  } catch {
    return { ok: true, value: {} };
  }
}
