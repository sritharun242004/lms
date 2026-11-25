import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { tinyJpeg, tinyPng } from "./fixtures";
import { extractImage, imageForClaude, MAX_IMAGE_BYTES_FOR_CLAUDE } from "./image";
import { FileReadError } from "./types";

const code = (promise: Promise<unknown>) => promise.then(() => "resolved", (e: unknown) => (e instanceof FileReadError ? e.code : "other"));

describe("images", () => {
  it("reads PNG and JPEG dimensions", async () => {
    expect(await extractImage(await tinyPng(40, 30), "PNG")).toEqual({ kind: "PNG", width: 40, height: 30 });
    expect(await extractImage(await tinyJpeg(20, 10), "JPEG")).toEqual({ kind: "JPEG", width: 20, height: 10 });
  });

  it("refuses bytes that are not a decodable image of the sniffed kind", async () => {
    expect(await code(extractImage(await tinyPng(), "JPEG"))).toBe("FILE_UNREADABLE");
    const broken = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(32).fill(0)]);
    expect(await code(extractImage(broken, "PNG"))).toBe("FILE_UNREADABLE");
  });

  it("sends Claude a copy fitted inside 1568 px, same format, never enlarged", async () => {
    const big = await imageForClaude(await tinyPng(3000, 1000), "PNG");
    expect(big.mediaType).toBe("image/png");
    const meta = await sharp(Buffer.from(big.base64, "base64")).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["png", 1568, 523]);

    const small = await imageForClaude(await tinyJpeg(30, 20), "JPEG");
    const smallMeta = await sharp(Buffer.from(small.base64, "base64")).metadata();
    expect([small.mediaType, smallMeta.format, smallMeta.width, smallMeta.height]).toEqual(["image/jpeg", "jpeg", 30, 20]);
  });

  it("re-encodes a PNG that stays too large after resizing, so it always fits Claude's 5 MB image limit", async () => {
    // Noise does not compress: 2000 x 2000 RGBA noise is ~9.8 MB as a 1568 px PNG.
    const noise = await sharp(randomBytes(2000 * 2000 * 4), { raw: { width: 2000, height: 2000, channels: 4 } }).png({ compressionLevel: 0 }).toBuffer();
    const out = await imageForClaude(new Uint8Array(noise), "PNG");
    const bytes = Buffer.from(out.base64, "base64");
    expect(bytes.byteLength).toBeLessThanOrEqual(MAX_IMAGE_BYTES_FOR_CLAUDE);
    expect(out.base64.length).toBeLessThan(5 * 1024 * 1024);
    const meta = await sharp(bytes).metadata();
    expect([out.mediaType, meta.format]).toEqual(["image/jpeg", "jpeg"]);
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(1568);
  }, 20_000);

  it("refuses an image declaring more pixels than the decode limit", async () => {
    const huge = await sharp({ create: { width: 8000, height: 8000, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png({ compressionLevel: 9 }).toBuffer();
    expect(await code(extractImage(new Uint8Array(huge), "PNG"))).toBe("FILE_UNREADABLE");
    expect(await code(imageForClaude(new Uint8Array(huge), "PNG"))).toBe("FILE_UNREADABLE");
  });
});
