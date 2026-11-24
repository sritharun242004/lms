import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { tinyJpeg, tinyPng } from "./fixtures";
import { extractImage, imageForClaude } from "./image";
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
});
