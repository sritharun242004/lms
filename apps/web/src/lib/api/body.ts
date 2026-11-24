/** A JSON body read with a byte cap, so an oversized request is refused before it is buffered and parsed. */
export type BoundedJson = { ok: true; value: unknown } | { ok: false; reason: "too_large" };

/**
 * Rejects a declared content-length over `maxBytes` without reading, otherwise streams at most `maxBytes`.
 * A body that is not JSON reads as `{}`, like `req.json().catch(() => ({}))`, so schema validation reports it.
 */
export async function readJsonWithin(req: Request, maxBytes: number): Promise<BoundedJson> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, reason: "too_large" };
  if (!req.body) return { ok: true, value: {} };
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return { ok: false, reason: "too_large" };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { ok: true, value: {} };
  }
}
